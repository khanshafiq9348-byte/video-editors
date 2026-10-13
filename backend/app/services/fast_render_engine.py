import os
import sys
import json
import time
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Optional, Callable

# Global registry of active render processes for clean cancellation
ACTIVE_FFMPEG_PROCESSES: Dict[str, List[subprocess.Popen]] = {}
ACTIVE_FFMPEG_LOCK = threading.Lock()

def register_process(job_id: str, proc: subprocess.Popen):
    with ACTIVE_FFMPEG_LOCK:
        if job_id not in ACTIVE_FFMPEG_PROCESSES:
            ACTIVE_FFMPEG_PROCESSES[job_id] = []
        ACTIVE_FFMPEG_PROCESSES[job_id].append(proc)

def unregister_process(job_id: str, proc: subprocess.Popen):
    with ACTIVE_FFMPEG_LOCK:
        if job_id in ACTIVE_FFMPEG_PROCESSES:
            try:
                ACTIVE_FFMPEG_PROCESSES[job_id].remove(proc)
            except ValueError:
                pass

def cancel_fast_render(job_id: str):
    with ACTIVE_FFMPEG_LOCK:
        procs = ACTIVE_FFMPEG_PROCESSES.pop(job_id, [])
        for p in procs:
            try:
                p.kill()
            except Exception:
                pass

_CACHED_ENCODER = None

def detect_best_h264_encoder() -> tuple[str, list[str]]:
    """Auto-detects available GPU hardware acceleration on the host system."""
    global _CACHED_ENCODER
    if _CACHED_ENCODER is not None:
        return _CACHED_ENCODER

    # Check available ffmpeg encoders
    try:
        res = subprocess.run(
            ["ffmpeg", "-encoders"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        encoders_output = res.stdout
    except Exception:
        encoders_output = ""

    # Priority 1: Windows MediaFoundation (Works on Intel Iris Xe / Arc / NVIDIA / AMD on Windows)
    if "h264_mf" in encoders_output and sys.platform == "win32":
        try:
            test = subprocess.run(
                ["ffmpeg", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.04", "-c:v", "h264_mf", "-f", "null", "-"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=4
            )
            if test.returncode == 0:
                print("[FastRenderEngine] Hardware Acceleration enabled: Windows MediaFoundation (h264_mf)")
                _CACHED_ENCODER = ("h264_mf", [])
                return _CACHED_ENCODER
        except Exception:
            pass

    # Priority 2: NVIDIA NVENC
    if "h264_nvenc" in encoders_output:
        try:
            test = subprocess.run(
                ["ffmpeg", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.04", "-c:v", "h264_nvenc", "-f", "null", "-"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=4
            )
            if test.returncode == 0:
                print("[FastRenderEngine] Hardware Acceleration enabled: NVIDIA NVENC (h264_nvenc)")
                _CACHED_ENCODER = ("h264_nvenc", ["-preset", "p4"])
                return _CACHED_ENCODER
        except Exception:
            pass

    # Priority 3: Intel Quick Sync (QSV)
    if "h264_qsv" in encoders_output:
        try:
            test = subprocess.run(
                ["ffmpeg", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.04", "-c:v", "h264_qsv", "-f", "null", "-"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=4
            )
            if test.returncode == 0:
                print("[FastRenderEngine] Hardware Acceleration enabled: Intel Quick Sync (h264_qsv)")
                _CACHED_ENCODER = ("h264_qsv", ["-preset", "veryfast"])
                return _CACHED_ENCODER
        except Exception:
            pass

    # Priority 4: AMD AMF
    if "h264_amf" in encoders_output:
        try:
            test = subprocess.run(
                ["ffmpeg", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=0.04", "-c:v", "h264_amf", "-f", "null", "-"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=4
            )
            if test.returncode == 0:
                print("[FastRenderEngine] Hardware Acceleration enabled: AMD AMF (h264_amf)")
                _CACHED_ENCODER = ("h264_amf", [])
                return _CACHED_ENCODER
        except Exception:
            pass

    # Fallback: High-performance multi-threaded CPU libx264
    print("[FastRenderEngine] Using optimized multi-threaded libx264 (preset: veryfast)")
    _CACHED_ENCODER = ("libx264", ["-preset", "veryfast", "-threads", "8"])
    return _CACHED_ENCODER


def render_scene_chunk(
    job_id: str,
    scene: Dict[str, Any],
    scene_idx: int,
    image_path: str,
    output_chunk_path: str,
    width: int,
    height: int,
    fps: int,
    encoder_name: str,
    encoder_flags: List[str],
    bitrate_k: int,
    crf: int,
    cancel_event: threading.Event,
    next_image_path: Optional[str] = None,
    next_scene: Optional[Dict[str, Any]] = None
) -> bool:
    """Renders a single scene with Ken Burns motion, transitions and color grading into an MP4 chunk."""
    if cancel_event.is_set():
        return False

    duration_frames = max(1, int(scene.get("durationFrames", fps * 4)))
    duration_sec = duration_frames / fps
    effect = scene.get("effect") or {}
    effect_type = effect.get("type", "zoom_in")
    fit_mode = scene.get("fitMode", "fill")
    color_tone = scene.get("colorTone", "original")
    transition_out = scene.get("transitionOut") or {}
    trans_type = transition_out.get("type", "crossfade") if isinstance(transition_out, dict) else "crossfade"

    # Target zoom canvas dimension (scale slightly larger than output for super crisp pan/zoom)
    canvas_w = int(width * 1.16)
    canvas_h = int(height * 1.16)
    if canvas_w % 2 != 0: canvas_w += 1
    if canvas_h % 2 != 0: canvas_h += 1

    # Base scaling to fill canvas
    v0_filters = [
        f"scale={canvas_w}:{canvas_h}:force_original_aspect_ratio=increase",
        f"crop={canvas_w}:{canvas_h}"
    ]

    # Camera Ken Burns motion using normalized on/tot_f with d=1 for smooth, continuous motion
    tot_f = max(1, duration_frames)
    if effect_type == "zoom_in":
        v0_filters.append(
            f"zoompan=z='min(1.0+0.16*(on/{tot_f}),1.16)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={fps}"
        )
    elif effect_type == "zoom_out":
        v0_filters.append(
            f"zoompan=z='max(1.16-0.16*(on/{tot_f}),1.0)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={fps}"
        )
    elif effect_type == "pan_left":
        v0_filters.append(
            f"zoompan=z=1.14:d=1:x='(iw-iw/zoom)*(1.0-on/{tot_f})':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={fps}"
        )
    elif effect_type == "pan_right":
        v0_filters.append(
            f"zoompan=z=1.14:d=1:x='(iw-iw/zoom)*(on/{tot_f})':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={fps}"
        )
    elif effect_type == "pan_up":
        v0_filters.append(
            f"zoompan=z=1.14:d=1:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1.0-on/{tot_f})':s={width}x{height}:fps={fps}"
        )
    elif effect_type == "pan_down":
        v0_filters.append(
            f"zoompan=z=1.14:d=1:x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(on/{tot_f})':s={width}x{height}:fps={fps}"
        )
    elif effect_type == "zoom_pan":
        v0_filters.append(
            f"zoompan=z='min(1.0+0.14*(on/{tot_f}),1.14)':d=1:x='(iw-iw/zoom)*(on/{tot_f})':y='(ih-ih/zoom)*(on/{tot_f})':s={width}x{height}:fps={fps}"
        )
    elif effect_type == "static":
        v0_filters = [
            f"scale={width}:{height}:force_original_aspect_ratio=increase",
            f"crop={width}:{height}"
        ]
    else:
        v0_filters.append(
            f"zoompan=z='min(1.0+0.12*(on/{tot_f}),1.12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={width}x{height}:fps={fps}"
        )

    # Color Grading tone
    if color_tone == "warm":
        v0_filters.append("colorchannelmixer=rr=1.08:gg=1.02:bb=0.92")
    elif color_tone == "cool":
        v0_filters.append("colorchannelmixer=rr=0.92:gg=1.02:bb=1.08")
    elif color_tone == "cinematic":
        v0_filters.append("eq=contrast=1.08:saturation=1.12")

    # Transition handling
    trans_frames = (
        transition_out.get("durationFrames")
        if (transition_out and isinstance(transition_out, dict))
        else int(fps * 0.4)
    )
    if not trans_frames or trans_frames <= 0:
        trans_frames = int(fps * 0.4)
    trans_sec = max(0.15, min(trans_frames / fps, duration_sec * 0.35, 0.6))
    fade_start = max(0.0, duration_sec - trans_sec)

    has_next = (
        next_image_path is not None
        and os.path.exists(next_image_path)
        and duration_sec >= 0.5
    )

    cmd = None
    v0_chain = ",".join(v0_filters)

    def get_input_flags(path: Optional[str]) -> List[str]:
        if not path:
            return []
        p_ext = os.path.splitext(path)[1].lower()
        if p_ext in {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".flv", ".wmv"}:
            return ["-stream_loop", "-1", "-i", path]
        return ["-loop", "1", "-i", path]

    in0 = get_input_flags(image_path)
    in1 = get_input_flags(next_image_path)

    def get_v1_base(is_alpha: bool = True) -> str:
        next_eff = (next_scene.get("effect") or {}).get("type", "zoom_in") if next_scene else "zoom_in"
        next_color = next_scene.get("colorTone", "original") if next_scene else "original"
        if next_eff == "zoom_out":
            base = f"scale={int(width*1.16)}:{int(height*1.16)}:force_original_aspect_ratio=increase,crop={width}:{height}"
        else:
            base = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height}"

        if next_color == "warm":
            base += ",colorchannelmixer=rr=1.08:gg=1.02:bb=0.92"
        elif next_color == "cool":
            base += ",colorchannelmixer=rr=0.92:gg=1.02:bb=1.08"
        elif next_color == "cinematic":
            base += ",eq=contrast=1.08:saturation=1.12"

        fmt = "yuva420p" if is_alpha else "yuv420p"
        return f"{base},format={fmt}"

    if trans_type in ["crossfade", "automatic", "auto"] and has_next:
        # True seamless crossfade dissolve: match next scene's start parameters so zero jump occurs
        v1_scale = f"{get_v1_base(is_alpha=True)},fade=t=in:st={fade_start:.3f}:d={trans_sec:.3f}:alpha=1"
        filter_complex = (
            f"[0:v]{v0_chain}[v0];"
            f"[1:v]{v1_scale}[v1];"
            f"[v0][v1]overlay=0:0:format=yuv420,format=yuv420p[outv]"
        )
        cmd = [
            "ffmpeg", "-y",
            *in0,
            *in1,
            "-t", f"{duration_sec:.4f}",
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-c:v", encoder_name,
        ]
    elif trans_type == "fade" and duration_sec >= 0.5:
        # Smooth Dip to Black
        v0_filters.append(f"fade=t=out:st={fade_start:.3f}:d={trans_sec:.3f}")
        v0_filters.append("format=yuv420p")
        vf_string = ",".join(v0_filters)
        cmd = [
            "ffmpeg", "-y",
            *in0,
            "-t", f"{duration_sec:.4f}",
            "-vf", vf_string,
            "-c:v", encoder_name,
        ]
    elif trans_type == "slide_left" and has_next:
        v1_scale = get_v1_base(is_alpha=False)
        filter_complex = (
            f"[0:v]{v0_chain}[v0];"
            f"[1:v]{v1_scale}[v1];"
            f"[v0][v1]overlay=x='if(gte(t,{fade_start:.3f}),w-(w*(t-{fade_start:.3f})/{trans_sec:.3f}),NAN)':y=0:format=yuv420,format=yuv420p[outv]"
        )
        cmd = [
            "ffmpeg", "-y",
            *in0,
            *in1,
            "-t", f"{duration_sec:.4f}",
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-c:v", encoder_name,
        ]
    elif trans_type == "slide_right" and has_next:
        v1_scale = get_v1_base(is_alpha=False)
        filter_complex = (
            f"[0:v]{v0_chain}[v0];"
            f"[1:v]{v1_scale}[v1];"
            f"[v0][v1]overlay=x='if(gte(t,{fade_start:.3f}),-w+(w*(t-{fade_start:.3f})/{trans_sec:.3f}),NAN)':y=0:format=yuv420,format=yuv420p[outv]"
        )
        cmd = [
            "ffmpeg", "-y",
            *in0,
            *in1,
            "-t", f"{duration_sec:.4f}",
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-c:v", encoder_name,
        ]
    elif trans_type in ["zoom", "zoom_in", "zoom_out"] and has_next:
        v1_scale = f"{get_v1_base(is_alpha=True)},fade=t=in:st={fade_start:.3f}:d={trans_sec:.3f}:alpha=1"
        filter_complex = (
            f"[0:v]{v0_chain}[v0];"
            f"[1:v]{v1_scale}[v1];"
            f"[v0][v1]overlay=0:0:format=yuv420,format=yuv420p[outv]"
        )
        cmd = [
            "ffmpeg", "-y",
            *in0,
            *in1,
            "-t", f"{duration_sec:.4f}",
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-c:v", encoder_name,
        ]
    else:
        # Cut (Instant) or final scene
        v0_filters.append("format=yuv420p")
        vf_string = ",".join(v0_filters)
        cmd = [
            "ffmpeg", "-y",
            *in0,
            "-t", f"{duration_sec:.4f}",
            "-vf", vf_string,
            "-c:v", encoder_name,
        ]

    cmd.extend(encoder_flags)

    if encoder_name == "libx264":
        cmd.extend(["-crf", str(crf)])
    else:
        cmd.extend(["-b:v", f"{bitrate_k}k"])

    cmd.append(output_chunk_path)

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    register_process(job_id, proc)

    try:
        stdout, stderr = proc.communicate()
        unregister_process(job_id, proc)
        return proc.returncode == 0 and os.path.exists(output_chunk_path)
    except Exception:
        unregister_process(job_id, proc)
        return False


def run_fast_render_pipeline(
    job_id: str,
    project_id: str,
    timeline_data: Dict[str, Any],
    render_settings: Dict[str, Any],
    output_mp4_path: str,
    storage_dir: str,
    update_progress: Callable[[float], None]
) -> bool:
    """Executes the high-performance parallel FFmpeg video export engine."""
    cancel_event = threading.Event()

    raw_scenes = timeline_data.get("scenes") or []
    if not raw_scenes:
        raise ValueError("No visual scenes in timeline.")

    # 1. Sanitize Scene Timings:
    # Filter out near-zero duration artifact scenes (< 8 frames / ~0.26s) from legacy DB records
    # and guarantee the first scene starts strictly at frame 0 (00:00.000)
    scenes = []
    for s in raw_scenes:
        dur = int(s.get("durationFrames", 0))
        if dur >= 8 or len(raw_scenes) == 1:
            scenes.append(s)
        elif scenes:
            scenes[-1]["durationFrames"] = int(scenes[-1].get("durationFrames", 0)) + dur

    if not scenes:
        scenes = raw_scenes

    # Anchor Scene 0 strictly at frame 0 (00:00.000)
    scenes[0]["startFrame"] = 0

    # 1. Resolve Target Output Resolution & FPS
    fps = int(render_settings.get("fps") or timeline_data.get("settings", {}).get("fps") or 30)
    width = render_settings.get("width")
    height = render_settings.get("height")
    if not width or not height:
        ratio = render_settings.get("aspect_ratio") or timeline_data.get("settings", {}).get("aspect_ratio")
        if ratio == "9:16":
            width, height = 1080, 1920
        elif ratio == "1:1":
            width, height = 1080, 1080
        else:
            width, height = 1920, 1080

    # Ensure even dimensions (required by H.264 standard)
    width = int(width) if int(width) % 2 == 0 else int(width) + 1
    height = int(height) if int(height) % 2 == 0 else int(height) + 1

    # Quality settings
    quality = render_settings.get("quality", "high")
    if quality == "standard":
        crf = 22
        bitrate_k = 4500 if width * height <= 1920 * 1080 else 12000
    elif quality == "max":
        crf = 16
        bitrate_k = 12000 if width * height <= 1920 * 1080 else 30000
    else:  # "high" (default)
        crf = 18
        bitrate_k = 7500 if width * height <= 1920 * 1080 else 20000

    # 2. Hardware Encoder Selection
    encoder_name, encoder_flags = detect_best_h264_encoder()

    # 3. Locate Scene Asset Images
    project_assets_dir = os.path.join(storage_dir, "projects", project_id, "assets")
    available_files = os.listdir(project_assets_dir) if os.path.exists(project_assets_dir) else []

    scene_tasks = []
    for idx, scene in enumerate(scenes):
        img_id = scene.get("imageAssetId", "")
        # Match asset file
        match_file = None
        for f in available_files:
            if f.startswith(img_id):
                match_file = os.path.join(project_assets_dir, f)
                break
        
        # Fallback to imageUrl if path exists
        if not match_file and scene.get("imageUrl"):
            local_candidate = os.path.join(storage_dir, scene["imageUrl"].replace("/storage/", "").replace("/", os.sep))
            if os.path.exists(local_candidate):
                match_file = local_candidate

        if not match_file or not os.path.exists(match_file):
            print(f"[FastRenderEngine] Warning: Scene image for {img_id} not found, skipping or placeholder.")
            continue

        scene_tasks.append((idx, scene, match_file))

    if not scene_tasks:
        raise ValueError("Could not find source image assets on disk.")

    # 4. Prepare Temp Directory for Parallel Chunks
    temp_job_dir = os.path.join(storage_dir, "temp", f"render_{job_id}")
    os.makedirs(temp_job_dir, exist_ok=True)

    update_progress(5.0)

    # 5. Parallel Scene Generation across CPU/GPU with Seamless Crossfades
    # Dynamically allocate worker threads so multiple concurrent exports run smoothly without contention
    cpu_count = os.cpu_count() or 4
    try:
        from app.services.render_service import get_active_export_count
        active_jobs = max(1, get_active_export_count())
    except Exception:
        active_jobs = 1

    if active_jobs > 1:
        num_workers = max(2, min(cpu_count // active_jobs, 4))
    else:
        num_workers = max(2, min(cpu_count, 6))

    print(f"[FastRenderEngine] Rendering {len(scene_tasks)} scenes ({width}x{height} @ {fps}fps) with {num_workers} parallel workers using {encoder_name} (Active exports: {active_jobs})...")

    completed_scenes = 0
    total_scenes = len(scene_tasks)
    rendered_chunk_files = {}

    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        future_to_idx = {}
        for t_idx, (idx, scene, img_path) in enumerate(scene_tasks):
            # Pass next scene's image and scene metadata for smooth crossfade transition (None for final scene)
            next_img = scene_tasks[t_idx + 1][2] if t_idx < total_scenes - 1 else None
            next_scene_obj = scene_tasks[t_idx + 1][1] if t_idx < total_scenes - 1 else None
            chunk_out = os.path.join(temp_job_dir, f"chunk_{idx:04d}.mp4")
            fut = executor.submit(
                render_scene_chunk,
                job_id,
                scene,
                idx,
                img_path,
                chunk_out,
                width,
                height,
                fps,
                encoder_name,
                encoder_flags,
                bitrate_k,
                crf,
                cancel_event,
                next_img,
                next_scene_obj
            )
            future_to_idx[fut] = (idx, chunk_out)

        for future in as_completed(future_to_idx):
            idx, chunk_path = future_to_idx[future]
            try:
                success = future.result()
                if success:
                    rendered_chunk_files[idx] = chunk_path
                    completed_scenes += 1
                    prog = 5.0 + 85.0 * (completed_scenes / total_scenes)
                    update_progress(round(prog, 1))
                else:
                    print(f"[FastRenderEngine] Scene {idx} rendering failed.")
            except Exception as e:
                print(f"[FastRenderEngine] Scene {idx} raised error: {e}")

    if len(rendered_chunk_files) < total_scenes * 0.8:
        shutil.rmtree(temp_job_dir, ignore_errors=True)
        raise RuntimeError(f"Too many scenes failed during parallel render ({len(rendered_chunk_files)}/{total_scenes}).")

    # 6. Build Concat List in Exact Scene Order
    concat_list_path = os.path.join(temp_job_dir, "concat_list.txt")
    sorted_indices = sorted(rendered_chunk_files.keys())
    with open(concat_list_path, "w", encoding="utf-8") as f:
        for s_idx in sorted_indices:
            escaped_path = rendered_chunk_files[s_idx].replace("\\", "/")
            f.write(f"file '{escaped_path}'\n")

    update_progress(92.0)

    # 7. Locate Voiceover Audio Track
    audio_info = timeline_data.get("audio") or {}
    audio_asset_id = audio_info.get("assetId")
    audio_start_frame = audio_info.get("startFrame", 0)
    audio_start_sec = max(0.0, audio_start_frame / fps)

    audio_file_path = None
    if audio_asset_id:
        for f in available_files:
            if f.startswith(audio_asset_id):
                audio_file_path = os.path.join(project_assets_dir, f)
                break

    # 8. Lossless Concatenation & Audio Multiplexing from 00:00
    print("[FastRenderEngine] Performing instant lossless stream-concat & audio multiplexing...")
    concat_cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list_path,
    ]

    if audio_file_path and os.path.exists(audio_file_path):
        # Guarantee audio starts from exact beginning (00:00.000)
        # Never use -ss seek when starting at 0 to avoid decoder initial packet drops
        if audio_start_sec > 0.05:
            concat_cmd.extend([
                "-ss", f"{audio_start_sec:.3f}",
                "-i", audio_file_path,
            ])
        else:
            concat_cmd.extend([
                "-i", audio_file_path,
            ])

        concat_cmd.extend([
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "256k",
            "-shortest",
        ])
    else:
        concat_cmd.extend([
            "-map", "0:v:0",
            "-c:v", "copy",
        ])

    concat_cmd.extend([
        "-movflags", "+faststart",
        output_mp4_path
    ])

    concat_proc = subprocess.Popen(
        concat_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    register_process(job_id, concat_proc)

    try:
        stdout, stderr = concat_proc.communicate()
        unregister_process(job_id, concat_proc)
        if concat_proc.returncode != 0 or not os.path.exists(output_mp4_path):
            raise RuntimeError(f"Concat failed with code {concat_proc.returncode}: {stderr[:300]}")

        # 9. Burn-in Captions (if enabled)
        captions_data = timeline_data.get("captions")
        should_burn = render_settings.get("burn_captions")
        if should_burn is None and captions_data:
            should_burn = captions_data.get("settings", {}).get("enabled", True)

        if should_burn and captions_data and captions_data.get("segments"):
            print(f"[FastRenderEngine] Burning captions into video using hardware acceleration...")
            try:
                from app.schemas.captions import TimelineCaptions
                from app.services.caption_service import export_captions_to_ass
                caps_obj = TimelineCaptions(**captions_data)
                ass_content = export_captions_to_ass(caps_obj, width=width, height=height)
                sub_ass_path = os.path.join(temp_job_dir, "captions.ass")
                with open(sub_ass_path, "w", encoding="utf-8") as f:
                    f.write(ass_content)

                burned_tmp_path = os.path.join(temp_job_dir, "burned_output.mp4")
                escaped_ass_path = sub_ass_path.replace("\\", "/").replace(":", "\\:")
                burn_cmd = [
                    "ffmpeg", "-y",
                    "-i", output_mp4_path,
                    "-vf", f"ass={escaped_ass_path}",
                    "-c:v", encoder_name,
                    *encoder_flags,
                    "-c:a", "copy",
                    "-movflags", "+faststart",
                    burned_tmp_path
                ]
                burn_proc = subprocess.Popen(
                    burn_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                register_process(job_id, burn_proc)
                b_stdout, b_stderr = burn_proc.communicate()
                unregister_process(job_id, burn_proc)
                if burn_proc.returncode == 0 and os.path.exists(burned_tmp_path):
                    shutil.move(burned_tmp_path, output_mp4_path)
                    print(f"[FastRenderEngine] Captions burned successfully into final video!")
                else:
                    print(f"[FastRenderEngine] Subtitle burning note: {b_stderr[:250]}. Video preserved.")
            except Exception as burn_err:
                print(f"[FastRenderEngine] Subtitle burn warning: {burn_err}")
    finally:
        # Cleanup temporary chunks directory
        try:
            shutil.rmtree(temp_job_dir, ignore_errors=True)
        except Exception:
            pass

    update_progress(100.0)
    print(f"[FastRenderEngine] Export successfully finished: {output_mp4_path}")
    return True
