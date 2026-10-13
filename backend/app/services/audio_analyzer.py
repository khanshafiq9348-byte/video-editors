import subprocess
import json
import os
import re
from typing import Dict, Any, List, Optional
import soundfile as sf
import numpy as np

def check_ffmpeg() -> bool:
    try:
        res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return res.returncode == 0
    except Exception:
        return False

def get_media_metadata(file_path: str) -> Dict[str, Any]:
    """Inspect audio or image metadata using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        data = json.loads(result.stdout)
        duration = None
        width = None
        height = None
        
        if "format" in data and "duration" in data["format"]:
            try:
                duration = float(data["format"]["duration"])
            except ValueError:
                pass
                
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                width = stream.get("width")
                height = stream.get("height")
            elif stream.get("codec_type") == "audio" and duration is None:
                if "duration" in stream:
                    try:
                        duration = float(stream["duration"])
                    except ValueError:
                        pass
                        
        return {
            "duration": duration,
            "width": width,
            "height": height,
            "raw": data
        }
    except Exception as e:
        print(f"Error inspecting media {file_path}: {e}")
        return {"duration": None, "width": None, "height": None, "error": str(e)}

def convert_audio_to_wav(input_path: str, output_path: str, sample_rate: int = 16000) -> bool:
    """Convert any audio file to 16kHz mono WAV for reliable analysis."""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ac", "1",
        "-ar", str(sample_rate),
        output_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return res.returncode == 0
    except Exception as e:
        print(f"Error converting audio to wav: {e}")
        return False

def generate_waveform_points(audio_path: str, num_points: int = 150) -> List[float]:
    """Generate normalized waveform amplitudes for UI visualization."""
    try:
        data, samplerate = sf.read(audio_path)
        if len(data.shape) > 1:
            data = data.mean(axis=1)  # Mono
        
        # Split into bins
        total_samples = len(data)
        if total_samples == 0:
            return [0.0] * num_points
            
        bin_size = max(1, total_samples // num_points)
        points = []
        for i in range(num_points):
            start = i * bin_size
            end = min(total_samples, start + bin_size)
            if start >= total_samples:
                points.append(0.0)
            else:
                chunk = data[start:end]
                rms = float(np.sqrt(np.mean(chunk**2))) if len(chunk) > 0 else 0.0
                points.append(rms)
                
        max_val = max(points) if points and max(points) > 0 else 1.0
        return [round(p / max_val, 3) for p in points]
    except Exception as e:
        print(f"Error generating waveform: {e}")
        return [0.2] * num_points

def split_text_into_sentences(text: str) -> List[str]:
    """Split text into sentences using punctuation while preserving integrity."""
    cleaned = text.strip()
    if not cleaned:
        return []
    # Split on sentence-ending punctuation followed by space or newline
    raw_sentences = re.split(r'(?<=[.!?])\s+', cleaned)
    sentences = [s.strip() for s in raw_sentences if s.strip()]
    return sentences

def detect_audio_sentences_vad(audio_path: str, min_silence_duration: float = 0.35, silence_threshold_db: float = -32.0) -> List[Dict[str, Any]]:
    """
    Extract accurate spoken sentence segments using multi-threshold acoustic voice detection.
    Strictly timestamp-driven with zero hardcoded durations.
    """
    meta = get_media_metadata(audio_path)
    total_duration = meta.get("duration")
    if not total_duration or total_duration <= 0:
        try:
            data, sr = sf.read(audio_path)
            total_duration = round(len(data) / float(sr), 3)
        except Exception:
            return []

    # Run multi-pass silence detection with ffmpeg to find real speech boundaries
    thresholds = [silence_threshold_db, -28.0, -38.0]
    best_segments: List[Dict[str, Any]] = []

    for thresh in thresholds:
        cmd = [
            "ffmpeg",
            "-i", audio_path,
            "-af", f"silencedetect=noise={thresh}dB:d={min_silence_duration}",
            "-f", "null",
            "-"
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            stderr = res.stderr

            silence_starts = []
            silence_ends = []
            for line in stderr.splitlines():
                if "silence_start:" in line:
                    m = re.search(r"silence_start:\s*([0-9.]+)", line)
                    if m:
                        silence_starts.append(float(m.group(1)))
                elif "silence_end:" in line:
                    m = re.search(r"silence_end:\s*([0-9.]+)", line)
                    if m:
                        silence_ends.append(float(m.group(1)))

            segments = []
            current_speech_start = 0.0

            for i, s_start in enumerate(silence_starts):
                if s_start > current_speech_start + 0.15:
                    segments.append({
                        "start": round(current_speech_start, 3),
                        "end": round(s_start, 3)
                    })
                if i < len(silence_ends):
                    current_speech_start = silence_ends[i]

            if current_speech_start < total_duration - 0.15:
                segments.append({
                    "start": round(current_speech_start, 3),
                    "end": round(total_duration, 3)
                })

            if len(segments) > len(best_segments):
                best_segments = segments
        except Exception:
            continue

    if best_segments:
        return best_segments

    # Single contiguous voiceover block if continuous speech with no pauses
    return [{"start": 0.0, "end": round(total_duration, 3)}]
