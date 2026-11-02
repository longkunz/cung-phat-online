import asyncio
import base64
import io
import os
import re
import sys
import threading
import time
import traceback
import unicodedata
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Set threading environment defaults for low CPU overhead
os.environ.setdefault("OMP_NUM_THREADS", "3")
os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")
os.environ.setdefault("MKL_NUM_THREADS", "3")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "3")
os.environ.setdefault("VECLIB_MAXIMUM_THREADS", "3")

# Vietnamese text filtering regexes
VIETNAMESE_ALLOWED_RE = re.compile(
    r"[^0-9a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠ-ỹ\s.,!?]"
)
BRACKET_EMOTE_RE = re.compile(r"\[[^\]]{1,24}\]")
REPEATED_CHARS_RE = re.compile(r"(\D)\1{2,}", re.IGNORECASE)
MULTI_PUNCT_RE = re.compile(r"([.,!?])\1+")
MULTI_SPACE_RE = re.compile(r"\s+")

LOCAL_MODEL_CANDIDATES = [
    os.environ.get("ZEROTTS_MODEL_PATH", ""),
    str(Path.home() / ".cache" / "zerotts-local"),
    str(Path(__file__).resolve().parent.parent.parent / "models" / "zerotts"),
    str(Path.cwd() / "models" / "zerotts"),
]


def resolve_model_source() -> str:
    for candidate in LOCAL_MODEL_CANDIDATES:
        if candidate and os.path.isdir(candidate) and os.path.isfile(os.path.join(candidate, "config.json")):
            return candidate

    # On Windows or cross-mount Docker volumes, HF cache symlinks can fail. Snapshot to local dir if needed.
    try:
        from huggingface_hub import snapshot_download
        env_target = os.environ.get("ZEROTTS_MODEL_PATH", "").strip()
        local_target = Path(env_target) if env_target else (Path.home() / ".cache" / "zerotts-local")
        local_target.mkdir(parents=True, exist_ok=True)
        snapshot_download(
            repo_id="zeroweight-ai/ZeroTTS",
            local_dir=str(local_target),
            max_workers=2
        )
        if (local_target / "config.json").is_file():
            return str(local_target)
    except Exception as exc:
        sys.stderr.write(f"[tts_service] snapshot_download warning: {exc}\n")

    return "zeroweight-ai/ZeroTTS"


def clean_and_normalize_text(raw_text: str) -> str:
    """Strict Vietnamese-only text sanitizer."""
    if not raw_text:
        return ""
    # 1. Normalize unicode (NFKC to resolve mathematical/script fonts, then NFC)
    text = unicodedata.normalize("NFC", unicodedata.normalize("NFKC", str(raw_text)))
    # 2. Strip bracket emotes like [thanks], [rose]
    text = BRACKET_EMOTE_RE.sub(" ", text)
    # 3. Strip non-Vietnamese foreign scripts, zalgo, cuneiform, emojis
    text = VIETNAMESE_ALLOWED_RE.sub(" ", text)
    # 4. Collapse repetitions
    text = MULTI_PUNCT_RE.sub(r"\1", text)
    text = REPEATED_CHARS_RE.sub(r"\1\1", text)
    text = MULTI_SPACE_RE.sub(" ", text).strip(" .,!?-")

    letters = re.findall(r"[a-zA-ZÀ-ỹĂăĐđĨĩŨũƠơƯư]", text)
    if len(letters) < 2:
        return ""

    if len(text) > 160:
        text = text[:160].rsplit(" ", 1)[0]

    try:
        from zerotts import normalize_vi_text
        from zerotts.chunking import normalize_punctuation
        normalized = normalize_vi_text(text)
        normalized = normalize_punctuation(normalized).strip()
        normalized = VIETNAMESE_ALLOWED_RE.sub(" ", normalized)
        normalized = MULTI_SPACE_RE.sub(" ", normalized).strip()
        if normalized and normalized[-1] not in ".!?":
            normalized += "."
        return normalized
    except ImportError:
        if text and text[-1] not in ".!?":
            text += "."
        return text


def polish_waveform(wav: np.ndarray, sample_rate: int) -> np.ndarray:
    """De-click ends and prevent clipping."""
    arr = np.asarray(wav, dtype=np.float32).reshape(-1)
    if arr.size == 0:
        return arr.reshape(1, 0)

    arr = arr - np.mean(arr)
    peak = float(np.max(np.abs(arr)))
    if peak > 0.90:
        arr = arr * (0.90 / peak)

    fade_in = min(int(sample_rate * 0.012), arr.size // 4)
    fade_out = min(int(sample_rate * 0.020), arr.size // 4)
    if fade_in > 1:
        ramp_in = 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, fade_in, dtype=np.float32)))
        arr[:fade_in] *= ramp_in
    if fade_out > 1:
        ramp_out = 0.5 * (1.0 + np.cos(np.linspace(0, np.pi, fade_out, dtype=np.float32)))
        arr[-fade_out:] *= ramp_out

    return arr.reshape(1, -1)


def audio_to_data_uri(wav: np.ndarray, sample_rate: int) -> tuple[str, float]:
    """Convert waveform array directly to in-memory Base64 Data URI."""
    buf = io.BytesIO()
    squeezed = np.asarray(wav).squeeze()
    sf.write(buf, squeezed, sample_rate, format="WAV", subtype="PCM_16")
    wav_bytes = buf.getvalue()
    b64 = base64.b64encode(wav_bytes).decode("ascii")
    data_uri = f"data:audio/wav;base64,{b64}"
    duration_sec = round(squeezed.shape[-1] / float(sample_rate), 2)
    return data_uri, duration_sec


# Global service state
START_TIME = time.time()
SERVICE_STATUS = "loading"
MODEL_SOURCE = resolve_model_source()
TTS_ENGINE = None
VOICES: List[str] = ["maichi"]
DEFAULT_VOICE = "maichi"
SAMPLE_RATE = 48000
CONCURRENCY_LOCK: Optional[asyncio.Lock] = None
LOAD_EVENT = threading.Event()


def _init_model() -> None:
    global TTS_ENGINE, SERVICE_STATUS, VOICES, DEFAULT_VOICE, SAMPLE_RATE
    try:
        from zerotts import ZeroTTS
        sys.stdout.write(f"[tts_service] Loading ZeroTTS from: {MODEL_SOURCE}...\n")
        sys.stdout.flush()
        tts = ZeroTTS.from_pretrained(MODEL_SOURCE, intra_op_num_threads=3)
        TTS_ENGINE = tts
        SAMPLE_RATE = int(tts.sample_rate)
        loaded_voices = tts.list_voices()
        if loaded_voices:
            VOICES = loaded_voices
            DEFAULT_VOICE = "maichi" if "maichi" in loaded_voices else loaded_voices[0]
        SERVICE_STATUS = "ready"
        sys.stdout.write(f"[tts_service] ZeroTTS ready! Default voice: {DEFAULT_VOICE}, sample rate: {SAMPLE_RATE}\n")
        sys.stdout.flush()
    except Exception as exc:
        SERVICE_STATUS = "error"
        sys.stderr.write(f"[tts_service] Failed to load ZeroTTS: {exc}\n{traceback.format_exc()}\n")
    finally:
        LOAD_EVENT.set()


# Start model load in background thread
_loader_thread = threading.Thread(target=_init_model, daemon=True)
_loader_thread.start()


def get_concurrency_lock() -> asyncio.Lock:
    global CONCURRENCY_LOCK
    if CONCURRENCY_LOCK is None:
        CONCURRENCY_LOCK = asyncio.Lock()
    return CONCURRENCY_LOCK


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure concurrency lock is tied to running event loop
    get_concurrency_lock()
    yield


app = FastAPI(
    title="Chùa Online ZeroTTS Microservice",
    description="Standalone Vietnamese voice synthesis microservice with direct in-memory audio delivery",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"ok": False, "error": str(exc)},
    )


class SynthesizeRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize in Vietnamese")
    voice: Optional[str] = Field(None, description="Voice name (default: maichi)")


class SynthesizeResponse(BaseModel):
    ok: bool = True
    audio: str
    durationSec: float
    voice: str


class HealthResponse(BaseModel):
    status: str
    voices: List[str]
    model: str
    sampleRate: int
    uptimeSec: float


class VoicesResponse(BaseModel):
    default: str
    voices: List[str]


@app.get("/health", response_model=HealthResponse)
async def health():
    uptime = round(time.time() - START_TIME, 2)
    return HealthResponse(
        status=SERVICE_STATUS,
        voices=VOICES,
        model=MODEL_SOURCE,
        sampleRate=SAMPLE_RATE,
        uptimeSec=uptime,
    )


@app.get("/voices", response_model=VoicesResponse)
async def voices():
    return VoicesResponse(
        default=DEFAULT_VOICE,
        voices=VOICES,
    )


@app.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(req: SynthesizeRequest):
    raw_text = (req.text or "").strip()
    if not raw_text:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"ok": False, "error": "Empty text"})

    norm_text = clean_and_normalize_text(raw_text)
    if not norm_text:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"ok": False, "error": "Filtered empty/spam text"})

    # Wait up to 30 seconds if model is still warming up
    if SERVICE_STATUS == "loading":
        await asyncio.to_thread(LOAD_EVENT.wait, 30.0)

    if SERVICE_STATUS != "ready" or TTS_ENGINE is None:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"ok": False, "error": f"TTS service is {SERVICE_STATUS}"},
        )

    voice = (req.voice or DEFAULT_VOICE).strip().lower()
    if voice not in VOICES:
        voice = DEFAULT_VOICE

    lock = get_concurrency_lock()
    async with lock:
        def _infer():
            try:
                raw_wav = TTS_ENGINE.synthesize(norm_text, voice=voice, eoa_extra_frames=2)
                if raw_wav is None or raw_wav.size == 0:
                    return None, "No audio generated"
                clean_audio = polish_waveform(raw_wav, SAMPLE_RATE)
                return audio_to_data_uri(clean_audio, SAMPLE_RATE), None
            except Exception as exc:
                return None, str(exc)

        result, err_msg = await asyncio.to_thread(_infer)
        if result is None:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"ok": False, "error": err_msg or "Inference failure"},
            )

        data_uri, duration_sec = result
        return SynthesizeResponse(
            ok=True,
            audio=data_uri,
            durationSec=duration_sec,
            voice=voice,
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8008))
    uvicorn.run("services.tts.main:app", host="0.0.0.0", port=port, reload=False)
