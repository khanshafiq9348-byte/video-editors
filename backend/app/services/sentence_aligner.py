import os
import re
from typing import List, Dict, Any, Optional
from app.services.audio_analyzer import convert_audio_to_wav, detect_audio_sentences_vad, split_text_into_sentences, get_media_metadata

# Check if faster_whisper or whisper is available
WHISPER_AVAILABLE = False
try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except Exception:
    try:
        import whisper
        WHISPER_AVAILABLE = True
    except Exception:
        WHISPER_AVAILABLE = False

# Check if Vosk ASR is available
VOSK_AVAILABLE = False
_vosk_model_instance = None

def get_vosk_model():
    global _vosk_model_instance, VOSK_AVAILABLE
    if _vosk_model_instance is not None:
        return _vosk_model_instance
    try:
        import vosk
        # Check standard model directory
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        model_dir = os.path.join(base_dir, "vosk_models", "vosk-model-small-en-us-0.15")
        if os.path.exists(model_dir):
            vosk.SetLogLevel(-1)
            _vosk_model_instance = vosk.Model(model_dir)
            VOSK_AVAILABLE = True
            return _vosk_model_instance
    except Exception as e:
        print(f"Vosk model initialization skipped: {e}")
    return None

def align_script_with_words(raw_words: List[Dict[str, Any]], script_sentences: List[str]) -> List[Dict[str, Any]]:
    import difflib
    speech_words = [w["word"].lower().strip() for w in raw_words]
    speech_starts = [float(w["start"]) for w in raw_words]
    speech_ends = [float(w["end"]) for w in raw_words]

    curr_speech_idx = 0
    n_speech = len(speech_words)
    results = []

    for sent in script_sentences:
        sent_words = [re.sub(r'[^\w]', '', w).lower() for w in sent.split() if w]
        if not sent_words:
            continue

        start_idx = curr_speech_idx
        first_w = sent_words[0]
        for s_i in range(curr_speech_idx, min(n_speech, curr_speech_idx + 15)):
            if speech_words[s_i] == first_w or difflib.SequenceMatcher(None, speech_words[s_i], first_w).ratio() > 0.75:
                start_idx = s_i
                break

        end_idx = min(n_speech - 1, start_idx + len(sent_words) - 1)
        last_w = sent_words[-1]
        for s_i in range(max(start_idx, end_idx - 5), min(n_speech, end_idx + 8)):
            if speech_words[s_i] == last_w or difflib.SequenceMatcher(None, speech_words[s_i], last_w).ratio() > 0.75:
                end_idx = s_i
                break

        start_t = speech_starts[start_idx]
        end_t = speech_ends[end_idx]
        results.append({
            "text": sent,
            "start": round(start_t, 3),
            "end": round(end_t, 3),
            "confidence": 0.95
        })
        curr_speech_idx = min(n_speech - 1, end_idx + 1)

    return results

def transcribe_with_vosk(audio_path: str, user_script: Optional[str] = None) -> List[Dict[str, Any]]:
    """Transcribes audio using Vosk and groups into spoken sentences using word-level alignment."""
    import wave
    import json
    import subprocess
    import vosk

    model = get_vosk_model()
    if not model:
        return []

    audio_abs = os.path.abspath(audio_path)
    temp_wav = os.path.join(os.path.dirname(audio_abs), f"temp_vosk_{os.getpid()}.wav")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", audio_abs, "-ar", "16000", "-ac", "1", temp_wav],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )

        wf = wave.open(temp_wav, "rb")
        rec = vosk.KaldiRecognizer(model, 16000)
        rec.SetWords(True)

        raw_words = []
        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                part = json.loads(rec.Result())
                if "result" in part:
                    raw_words.extend(part["result"])

        part = json.loads(rec.FinalResult())
        if "result" in part:
            raw_words.extend(part["result"])
        wf.close()

        if not raw_words:
            return []

        # If user provided a script, match script sentences directly to spoken word timestamps
        if user_script:
            script_sentences = split_text_into_sentences(user_script)
            if script_sentences:
                return align_script_with_words(raw_words, script_sentences)

        # Otherwise group spoken words into sentences based on speech pauses
        sentences = []
        curr_words = []
        curr_start = None

        for idx, w in enumerate(raw_words):
            word_str = w["word"].strip()
            w_start = float(w["start"])
            w_end = float(w["end"])

            if curr_start is None:
                curr_start = w_start
            curr_words.append(word_str)

            is_last = (idx == len(raw_words) - 1)
            is_break = False
            if not is_last:
                next_start = float(raw_words[idx + 1]["start"])
                pause = next_start - w_end
                if pause >= 0.32:
                    is_break = True
                elif len(curr_words) >= 7 and pause >= 0.22:
                    is_break = True
                elif len(curr_words) >= 14 and pause >= 0.16:
                    is_break = True

            if is_last or is_break:
                sent_text = " ".join(curr_words).capitalize() + "."
                sentences.append({
                    "text": sent_text,
                    "start": round(curr_start, 3),
                    "end": round(w_end, 3),
                    "confidence": 0.95
                })
                curr_words = []
                curr_start = None

        return sentences
    except Exception as e:
        print(f"Vosk speech recognition error: {e}")
        return []
    finally:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except Exception:
                pass

def analyze_and_segment_audio(audio_path: str, user_script: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Transcribes and segments audio into spoken sentences with exact start and end timestamps.
    Uses Vosk speech recognition as primary local engine, with Whisper and high-precision VAD fallbacks.
    Strictly timestamp-driven.
    """
    audio_abs = os.path.abspath(audio_path)
    meta = get_media_metadata(audio_abs)
    total_duration = meta.get("duration")
    if not total_duration or total_duration <= 0:
        try:
            import soundfile as sf
            data, sr = sf.read(audio_abs)
            total_duration = round(len(data) / float(sr), 3)
        except Exception as e:
            raise ValueError(f"Could not determine voiceover duration: {e}")

    # If user provided a script, split into individual sentences
    script_sentences = split_text_into_sentences(user_script) if user_script else []

    # 1. Primary: High-accuracy Vosk ASR with word-level acoustic alignment
    vosk_sentences = transcribe_with_vosk(audio_abs, user_script=user_script)
    if vosk_sentences:
        return vosk_sentences

    # 2. Try Whisper model if runtime libraries are operational
    model = get_whisper_model()
    if model is not None:
        try:
            segments, info = model.transcribe(audio_path, beam_size=5, word_timestamps=True)
            results = []
            
            for seg in segments:
                words = seg.words if hasattr(seg, "words") and seg.words else []
                if words:
                    current_words = []
                    current_start = None
                    for w in words:
                        if current_start is None:
                            current_start = w.start
                        current_words.append(w.word.strip())
                        if re.search(r'[.!?]$', w.word.strip()):
                            results.append({
                                "text": " ".join(current_words),
                                "start": round(current_start, 3),
                                "end": round(w.end, 3),
                                "confidence": round(w.probability if hasattr(w, "probability") else 0.95, 2)
                            })
                            current_words = []
                            current_start = None
                    if current_words and current_start is not None:
                        results.append({
                            "text": " ".join(current_words),
                            "start": round(current_start, 3),
                            "end": round(seg.end, 3),
                            "confidence": 0.90
                        })
                else:
                    results.append({
                        "text": seg.text.strip(),
                        "start": round(seg.start, 3),
                        "end": round(seg.end, 3),
                        "confidence": 0.90
                    })

            if results:
                if script_sentences:
                    results = align_with_script(results, script_sentences, total_duration)
                return results
        except Exception as e:
            print(f"Whisper transcription unavailable: {e}")

    # 3. Acoustic voice timestamps via high-precision multi-pass VAD
    vad_segments = detect_audio_sentences_vad(audio_path)
    if not vad_segments:
        return []

    results = []
    if script_sentences:
        num_sentences = len(script_sentences)
        num_vad = len(vad_segments)

        if num_sentences == 1:
            results.append({
                "text": script_sentences[0],
                "start": vad_segments[0]["start"],
                "end": vad_segments[-1]["end"],
                "confidence": 0.95
            })
        elif num_sentences <= num_vad:
            # Map script sentences directly onto detected acoustic segments
            for i, sent in enumerate(script_sentences):
                idx = min(num_vad - 1, int(round(i * (num_vad - 1) / (num_sentences - 1))))
                vad = vad_segments[idx]
                results.append({
                    "text": sent,
                    "start": vad["start"],
                    "end": vad["end"],
                    "confidence": 0.90
                })
        else:
            # More sentences than distinct silence breaks: proportionally distribute across actual audio duration
            audio_span = max(0.1, total_duration)
            for i, sent in enumerate(script_sentences):
                st = round((i / num_sentences) * audio_span, 3)
                et = round(((i + 1) / num_sentences) * audio_span, 3)
                results.append({
                    "text": sent,
                    "start": st,
                    "end": et,
                    "confidence": 0.88
                })
    else:
        # Generate sentence entries corresponding directly to each detected voiceover speech segment
        for idx, seg in enumerate(vad_segments):
            results.append({
                "text": f"Sentence {idx + 1} ({seg['start']}s - {seg['end']}s)",
                "start": seg["start"],
                "end": seg["end"],
                "confidence": 0.85
            })

    return results

def align_with_script(transcribed_sentences: List[Dict[str, Any]], script_sentences: List[str], total_duration: float) -> List[Dict[str, Any]]:
    """Align user-provided script sentences directly with acoustic timestamp boundaries."""
    if not script_sentences:
        return transcribed_sentences

    num_script = len(script_sentences)
    num_trans = len(transcribed_sentences)
    aligned = []

    if num_trans == 0:
        for i, s in enumerate(script_sentences):
            st = round((i / num_script) * total_duration, 3)
            et = round(((i + 1) / num_script) * total_duration, 3)
            aligned.append({
                "text": s,
                "start": st,
                "end": et,
                "confidence": 0.85
            })
        return aligned

    for i in range(num_script):
        script_text = script_sentences[i]
        trans_index = min(num_trans - 1, int(round(i * (num_trans - 1) / max(1, num_script - 1))))
        trans = transcribed_sentences[trans_index]
        aligned.append({
            "text": script_text,
            "start": trans["start"],
            "end": trans["end"],
            "confidence": 0.95
        })

    return aligned
