import pytest
import numpy as np
from services.tts.main import clean_and_normalize_text, polish_waveform, resolve_model_source

def test_long_ritual_message_does_not_drop_tail_clause():
    """Gift offerings and longer prayers must not have their last words or blessing dropped."""
    text = (
        "Công đức vô lượng! Cảm tạ thí chủ Nguyễn Văn A đã phát tâm dâng cúng Mâm Ngũ Quả Cát Tường, "
        "tích thêm 600 điểm công đức. Nguyện cầu chư Phật gia hộ cho thí chủ vạn sự cát tường như ý."
    )
    cleaned = clean_and_normalize_text(text)
    assert "cát tường như ý" in cleaned, f"Last blessing was chopped off! Got: {cleaned}"

def test_synthesized_waveform_has_tail_silence_padding():
    """Waveform must have at least 200ms of clean trailing silence so browser buffer flush never clips speech."""
    from zerotts import ZeroTTS
    tts = ZeroTTS.from_pretrained(resolve_model_source())
    voice = tts.resolve_voice("maichi")
    
    raw = tts.synthesize("Nam mô A Di Đà Phật.", voice=voice, eoa_extra_frames=1)
    cleaned = polish_waveform(raw, int(tts.sample_rate))
    
    sr = int(tts.sample_rate)
    tail_200ms_samples = int(sr * 0.20)
    tail_audio = cleaned.squeeze()[-tail_200ms_samples:]
    max_tail_energy = float(np.max(np.abs(tail_audio)))
    
    # In trailing 200ms, energy should be pure silence (< 0.005) to ensure safety against buffer cutoff
    assert max_tail_energy < 0.005, f"Trailing 200ms still has active speech energy {max_tail_energy:.4f}, not padded!"
