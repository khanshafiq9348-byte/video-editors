import os
import re
import json
import uuid
import wave
import subprocess
from typing import List, Dict, Any, Optional

from app.services.sentence_aligner import get_vosk_model, split_text_into_sentences, get_media_metadata
from app.services.audio_analyzer import detect_audio_sentences_vad
from app.services.caption_presets import BUILTIN_PRESETS, get_preset_by_id
from app.schemas.captions import (
    CaptionWord,
    CaptionSegment,
    CaptionStyle,
    CaptionPreset,
    CaptionSettings,
    TimelineCaptions,
)

def _format_srt_timestamp(seconds: float) -> str:
    millis = int(round((seconds - int(seconds)) * 1000))
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def _format_vtt_timestamp(seconds: float) -> str:
    millis = int(round((seconds - int(seconds)) * 1000))
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"

def _format_ass_timestamp(seconds: float) -> str:
    centis = int(round((seconds - int(seconds)) * 100))
    if centis >= 100:
        centis = 99
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:1d}:{minutes:02d}:{secs:02d}.{centis:02d}"

def _hex_to_ass_color(hex_color: str, opacity: float = 1.0) -> str:
    # ASS colors are &HAABBGGRR where AA is inverse opacity (00 = opaque, FF = transparent)
    hex_clean = hex_color.lstrip("#")
    if len(hex_clean) == 3:
        hex_clean = "".join([c * 2 for c in hex_clean])
    if len(hex_clean) != 6:
        hex_clean = "FFFFFF"
    
    r = hex_clean[0:2]
    g = hex_clean[2:4]
    b = hex_clean[4:6]
    alpha = int(round((1.0 - max(0.0, min(1.0, opacity))) * 255))
    return f"&H{alpha:02X}{b}{g}{r}".upper()

def extract_word_timestamps_from_audio(audio_path: str) -> List[Dict[str, Any]]:
    """Runs acoustic speech recognition to extract word-level timestamps."""
    model = get_vosk_model()
    if not model:
        return []

    audio_abs = os.path.abspath(audio_path)
    temp_wav = os.path.join(os.path.dirname(audio_abs), f"temp_cap_{os.getpid()}_{uuid.uuid4().hex[:6]}.wav")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", audio_abs, "-ar", "16000", "-ac", "1", temp_wav],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )

        import vosk
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

        results = []
        for idx, w in enumerate(raw_words):
            results.append({
                "id": f"word_{idx+1:04d}_{uuid.uuid4().hex[:4]}",
                "word": w.get("word", "").strip(),
                "start": float(w.get("start", 0.0)),
                "end": float(w.get("end", 0.0)),
                "conf": float(w.get("conf", 1.0)),
            })
        return results
    except Exception as e:
        print(f"[CaptionService] Vosk word alignment warning: {e}")
        return []
    finally:
        if os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except Exception:
                pass

def _enrich_words_from_script(raw_words: List[Dict[str, Any]], user_script: str) -> List[Dict[str, Any]]:
    """Restores capitalization, punctuation, and proper nouns from user script onto acoustic word timestamps."""
    if not user_script or not raw_words:
        return raw_words
    import difflib
    script_tokens = [t.strip() for t in user_script.split() if t.strip()]
    if not script_tokens:
        return raw_words

    script_idx = 0
    enriched = []
    for w in raw_words:
        w_clean = re.sub(r'[^\w]', '', w["word"]).lower()
        matched_token = None
        for s_i in range(script_idx, min(len(script_tokens), script_idx + 8)):
            s_clean = re.sub(r'[^\w]', '', script_tokens[s_i]).lower()
            if s_clean == w_clean or difflib.SequenceMatcher(None, s_clean, w_clean).ratio() > 0.75:
                matched_token = script_tokens[s_i]
                script_idx = s_i + 1
                break

        item = dict(w)
        if matched_token:
            item["word"] = matched_token
        enriched.append(item)
    return enriched

def group_words_into_segments(
    raw_words: List[Dict[str, Any]],
    fps: int = 30,
    words_per_segment: int = 5,
    user_script: Optional[str] = None
) -> List[CaptionSegment]:
    """
    Groups acoustic words into natural, readable sentence-level caption segments
    breaking on natural speech pauses (>= 0.35s) or sentence punctuation boundaries.
    Preserves precise word timestamps, spacing, and punctuation.
    """
    if not raw_words:
        return []

    if user_script:
        raw_words = _enrich_words_from_script(raw_words, user_script)

    segments: List[CaptionSegment] = []
    current_words: List[CaptionWord] = []
    seg_idx = 0

    for idx, w in enumerate(raw_words):
        w_text = w["word"].strip()
        # Capitalize first word of segment if not capitalized and no user script
        if not user_script and len(current_words) == 0 and w_text:
            w_text = w_text.capitalize()

        w_start = round(float(w["start"]), 3)
        w_end = round(float(w["end"]), 3)
        w_start_frame = int(round(w_start * fps))
        w_end_frame = max(w_start_frame + 1, int(round(w_end * fps)))

        c_word = CaptionWord(
            id=w.get("id") or f"word_{idx+1:04d}_{uuid.uuid4().hex[:4]}",
            text=w_text,
            startFrame=w_start_frame,
            endFrame=w_end_frame,
            startTime=w_start,
            endTime=w_end,
            confidence=float(w.get("conf", 1.0))
        )
        current_words.append(c_word)

        is_last = (idx == len(raw_words) - 1)
        is_break = False
        pause_to_next = 0.0
        if not is_last:
            next_start = float(raw_words[idx + 1]["start"])
            pause_to_next = max(0.0, next_start - w_end)
            # Break if natural speech pause is detected
            if pause_to_next >= 0.35:
                is_break = True
            # Break if segment reached preferred word count with slight pause
            elif len(current_words) >= words_per_segment and pause_to_next >= 0.18:
                is_break = True
            elif len(current_words) >= (words_per_segment + 3):
                is_break = True
            # Break on punctuation if word ends with period, question mark, or exclamation
            elif re.search(r'[.!?]$', w_text):
                is_break = True

        if is_last or is_break:
            seg_start_time = current_words[0].start_time or 0.0
            # Natural padding for caption readability on screen during pauses
            base_end_time = current_words[-1].end_time or (seg_start_time + 1.0)
            if pause_to_next > 0.08:
                seg_end_time = base_end_time + min(0.35, pause_to_next - 0.05)
            else:
                seg_end_time = base_end_time

            seg_start_frame = current_words[0].start_frame
            seg_end_frame = max(seg_start_frame + 5, int(round(seg_end_time * fps)))
            seg_text = " ".join([cw.text for cw in current_words])

            # Ensure sentence ending punctuation if it was a pause-based break and has no punctuation
            if not re.search(r'[.!?,;:]$', seg_text):
                seg_text = seg_text + "."

            seg_id = f"cap_seg_{seg_idx+1:03d}_{uuid.uuid4().hex[:6]}"
            segments.append(
                CaptionSegment(
                    id=seg_id,
                    text=seg_text,
                    startFrame=seg_start_frame,
                    endFrame=seg_end_frame,
                    startTime=round(seg_start_time, 3),
                    endTime=round(seg_end_time, 3),
                    words=list(current_words),
                )
            )
            current_words = []
            seg_idx += 1

    return segments

def generate_captions_from_audio(
    audio_path: str,
    fps: int = 30,
    user_script: Optional[str] = None,
    preset_id: str = "preset_yellow_karaoke",
    mode: str = "karaoke",
    words_per_segment: int = 5
) -> TimelineCaptions:
    """Generates word-level synchronized captions from voiceover audio without placeholders."""
    raw_words = extract_word_timestamps_from_audio(audio_path)

    # If Vosk direct extraction produced no words, attempt transcription via sentence aligner
    if not raw_words:
        try:
            from app.services.sentence_aligner import analyze_and_segment_audio
            aligned_segments = analyze_and_segment_audio(audio_path, user_script=user_script)
            if aligned_segments:
                for seg in aligned_segments:
                    for w in (seg.get("words") or []):
                        raw_words.append({
                            "id": f"word_{len(raw_words)+1:04d}_{uuid.uuid4().hex[:4]}",
                            "word": w.get("word", "").strip(),
                            "start": float(w.get("start", 0.0)),
                            "end": float(w.get("end", 0.0)),
                            "conf": float(w.get("confidence", 1.0)),
                        })
        except Exception as e:
            print(f"[CaptionService] Fallback aligner warning: {e}")

    # Never fabricate placeholder text: if no speech could be recognized, fail explicitly
    if not raw_words:
        raise ValueError(
            "No spoken words detected in the audio file. "
            "Please ensure your voiceover audio contains clear speech and retry."
        )

    segments = group_words_into_segments(
        raw_words=raw_words,
        fps=fps,
        words_per_segment=words_per_segment,
        user_script=user_script
    )

    preset_data = get_preset_by_id(preset_id)
    preset_style = CaptionStyle(**preset_data["style"])

    settings = CaptionSettings(
        enabled=True,
        mode=mode or preset_data.get("mode", "karaoke"),
        selectedPresetId=preset_id,
        globalStyle=preset_style,
        customPresets=[]
    )

    return TimelineCaptions(
        settings=settings,
        segments=segments
    )

def export_captions_to_srt(segments: List[CaptionSegment]) -> str:
    """Converts CaptionSegments into a standard .srt subtitle string."""
    lines = []
    for idx, seg in enumerate(segments, start=1):
        st_sec = seg.start_time if seg.start_time is not None else (seg.start_frame / 30.0)
        et_sec = seg.end_time if seg.end_time is not None else (seg.end_frame / 30.0)
        
        st_str = _format_srt_timestamp(max(0.0, st_sec))
        et_str = _format_srt_timestamp(max(st_sec + 0.1, et_sec))

        clean_text = " ".join(seg.text.split())
        lines.append(str(idx))
        lines.append(f"{st_str} --> {et_str}")
        lines.append(clean_text)
        lines.append("")

    return "\n".join(lines).strip() + "\n"

def export_captions_to_vtt(segments: List[CaptionSegment]) -> str:
    """Converts CaptionSegments into a standard WebVTT .vtt subtitle string."""
    lines = ["WEBVTT", ""]
    for idx, seg in enumerate(segments, start=1):
        st_sec = seg.start_time if seg.start_time is not None else (seg.start_frame / 30.0)
        et_sec = seg.end_time if seg.end_time is not None else (seg.end_frame / 30.0)

        st_str = _format_vtt_timestamp(max(0.0, st_sec))
        et_str = _format_vtt_timestamp(max(st_sec + 0.1, et_sec))

        clean_text = " ".join(seg.text.split())
        lines.append(str(idx))
        lines.append(f"{st_str} --> {et_str}")
        lines.append(clean_text)
        lines.append("")

    return "\n".join(lines).strip() + "\n"

def export_captions_to_ass(captions: TimelineCaptions, width: int = 1920, height: int = 1080) -> str:
    """
    Converts TimelineCaptions into an Advanced SubStation Alpha (.ass) string
    supporting high-speed FFmpeg burn-in with fonts, colors, stroke, and karaoke tags.
    """
    settings = captions.settings
    style = settings.global_style
    segments = captions.segments

    primary_color = _hex_to_ass_color(style.text_color, 1.0)
    secondary_color = _hex_to_ass_color(style.highlight_color, 1.0)
    outline_color = _hex_to_ass_color(style.stroke_color if style.stroke_enabled else "#000000", 1.0)
    back_color = _hex_to_ass_color(
        style.background_color if style.background_enabled else (style.shadow_color or "#000000"),
        style.background_opacity if style.background_enabled else 0.8
    )

    border_style = 3 if style.background_enabled else 1
    outline_w = style.stroke_width if style.stroke_enabled else 0
    shadow_w = 2 if style.shadow_enabled else 0

    # Alignment in ASS numpad: 2 = Bottom-Center, 5 = Mid-Center, 8 = Top-Center
    align = 2
    if style.position_y < 35:
        align = 8
    elif style.position_y < 65:
        align = 5

    margin_v = int(round(height * (1.0 - (style.position_y / 100.0)))) if align == 2 else 50
    margin_v = max(20, min(height - 50, margin_v))

    header = f"""[Script Info]
Title: AutoVideo Studio Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: {width}
PlayResY: {height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{style.font_family},{style.font_size},{primary_color},{secondary_color},{outline_color},{back_color},{-1 if style.font_weight >= 700 else 0},{-1 if style.italic else 0},0,0,100,100,{style.letter_spacing},0,{border_style},{outline_w},{shadow_w},{align},40,40,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    for seg in segments:
        st_sec = seg.start_time if seg.start_time is not None else (seg.start_frame / 30.0)
        et_sec = seg.end_time if seg.end_time is not None else (seg.end_frame / 30.0)
        
        st_ass = _format_ass_timestamp(max(0.0, st_sec))
        et_ass = _format_ass_timestamp(max(st_sec + 0.1, et_sec))

        if settings.mode in ["karaoke", "word_pop"] and seg.words:
            # Build ASS karaoke string using \k tags with explicit word spacing
            karaoke_parts = []
            for w in seg.words:
                w_txt = (w.text.upper() if style.uppercase else w.text).strip()
                if not w_txt:
                    continue
                w_st = w.start_time if w.start_time is not None else (w.start_frame / 30.0)
                w_et = w.end_time if w.end_time is not None else (w.end_frame / 30.0)
                dur_cs = max(1, int(round((w_et - w_st) * 100)))
                karaoke_parts.append(f"{{\\k{dur_cs}}}{w_txt}")
            text_to_show = " ".join(karaoke_parts)
        else:
            text_to_show = " ".join(seg.text.split())
            if style.uppercase:
                text_to_show = text_to_show.upper()

        events.append(f"Dialogue: 0,{st_ass},{et_ass},Default,,0,0,0,,{text_to_show}")

    return header + "\n".join(events) + "\n"
