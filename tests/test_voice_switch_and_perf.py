import asyncio
import pytest
from httpx import ASGITransport, AsyncClient

# Import app from services.tts.main
try:
    from services.tts.main import app, LOAD_EVENT
except ImportError:
    app = None
    LOAD_EVENT = None


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.asyncio
async def test_all_voices_synthesize_without_charmap_error():
    """Verify that switching to any voice (especially kimoanh, huuduc, tiendat) does not crash with charmap UnicodeDecodeError."""
    assert app is not None, "services.tts.main:app must be importable"
    if LOAD_EVENT:
        await asyncio.to_thread(LOAD_EVENT.wait, 30.0)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Get list of voices
        voices_res = await client.get("/voices")
        assert voices_res.status_code == 200
        voices_data = voices_res.json()
        voices = voices_data.get("voices", ["kimoanh"])

        # Test switching to problematic voices that contain Vietnamese chars in meta.json
        test_voices = [v for v in ["kimoanh", "huuduc", "tiendat", "baotrang", "maichi"] if v in voices]
        assert len(test_voices) > 0

        for voice in test_voices:
            res = await client.post("/synthesize", json={
                "text": "Nam mô A Di Đà Phật.",
                "voice": voice
            })
            assert res.status_code == 200, f"Voice {voice} failed with {res.status_code}: {res.text}"
            data = res.json()
            assert data["ok"] is True
            assert data["voice"] == voice
            assert "audio" in data
            assert data["audio"].startswith("data:audio/wav;base64,")
