import base64
import asyncio
import pytest
from httpx import ASGITransport, AsyncClient

# We will import app from services.tts.main
try:
    from services.tts.main import app, clean_and_normalize_text
except ImportError:
    app = None
    clean_and_normalize_text = None


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_module_import():
    assert app is not None, "services.tts.main:app must be importable"


@pytest.mark.asyncio
async def test_text_sanitizer():
    assert clean_and_normalize_text is not None
    # 1. Normalizes fancy unicode
    cleaned = clean_and_normalize_text("𝒯𝒽𝒾ê𝓃 𝒯â𝓂 dâng hương")
    assert "Thiên Tâm dâng hương" in cleaned

    # 2. Strips cuneiform and emotes
    cleaned2 = clean_and_normalize_text("[rose] 𒐫 Cảm tạ [thanks] 🙏")
    assert "Cảm tạ" in cleaned2
    assert "rose" not in cleaned2
    assert "thanks" not in cleaned2
    assert "𒐫" not in cleaned2

    # 3. Strips spam-only into empty string
    assert clean_and_normalize_text("𒐫𒐫 [rose] !!") == ""
    assert clean_and_normalize_text("   ") == ""


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] in ("loading", "ready")
        assert "voices" in data
        assert isinstance(data["voices"], list)
        assert "sampleRate" in data
        assert "uptimeSec" in data


@pytest.mark.asyncio
async def test_ready_endpoint(monkeypatch):
    import services.tts.main as tts_main
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # When loading or not ready, returns 503
        monkeypatch.setattr(tts_main, "SERVICE_STATUS", "loading")
        res_loading = await client.get("/ready")
        assert res_loading.status_code == 503

        # When ready, returns 200
        monkeypatch.setattr(tts_main, "SERVICE_STATUS", "ready")
        res_ready = await client.get("/ready")
        assert res_ready.status_code == 200


@pytest.mark.asyncio
async def test_voices_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/voices")
        assert res.status_code == 200
        data = res.json()
        assert "default" in data
        assert "voices" in data
        assert "maichi" in data["voices"]


@pytest.mark.asyncio
async def test_synthesize_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/synthesize", json={"text": "Nam mô A Di Đà Phật", "voice": "maichi"})
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["voice"] == "maichi"
        assert "audio" in data
        assert data["audio"].startswith("data:audio/wav;base64,")
        assert data["durationSec"] > 0

        # Decode base64 and verify RIFF WAV header
        header_prefix = "data:audio/wav;base64,"
        b64_str = data["audio"][len(header_prefix):]
        wav_bytes = base64.b64decode(b64_str)
        assert wav_bytes[:4] == b"RIFF"
        assert wav_bytes[8:12] == b"WAVE"


@pytest.mark.asyncio
async def test_synthesize_empty_and_spam_validation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/synthesize", json={"text": ""})
        assert res.status_code == 400
        assert res.json()["ok"] is False

        res2 = await client.post("/synthesize", json={"text": "𒐫𒐫 [rose] !!!"})
        assert res2.status_code == 400
        assert res2.json()["ok"] is False


@pytest.mark.asyncio
async def test_concurrency_lock():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        req1 = client.post("/synthesize", json={"text": "Cảm tạ thí chủ"})
        req2 = client.post("/synthesize", json={"text": "Nam mô Bổn Sư Thích Ca Mâu Ni Phật"})
        res1, res2 = await asyncio.gather(req1, req2)
        assert res1.status_code == 200
        assert res2.status_code == 200
        assert res1.json()["ok"] is True
        assert res2.json()["ok"] is True


@pytest.mark.asyncio
async def test_synthesize_inference_exception_returns_json_error(monkeypatch):
    import services.tts.main as tts_main
    await asyncio.to_thread(tts_main.LOAD_EVENT.wait, 30.0)
    assert tts_main.TTS_ENGINE is not None

    def _failing_synth(*args, **kwargs):
        raise RuntimeError("Simulated ONNX runtime crash")

    monkeypatch.setattr(tts_main.TTS_ENGINE, "synthesize", _failing_synth)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/synthesize", json={"text": "Nam mô A Di Đà Phật"})
        assert res.status_code == 500
        assert res.headers.get("content-type", "").startswith("application/json")
        body = res.json()
        assert body["ok"] is False
        assert "Simulated ONNX runtime crash" in body["error"]
