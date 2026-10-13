import os
import json
import subprocess
import uuid
import datetime
import threading
import concurrent.futures
from typing import Dict, Any, Optional, Set, List
from sqlalchemy.orm import Session
from app.models import RenderJob, Project, Timeline
from app.database import SessionLocal, BASE_DIR, STORAGE_DIR

# Active processes dict for Remotion fallback
ACTIVE_RENDER_PROCESSES: Dict[str, subprocess.Popen] = {}
CANCEL_FLAGS: Dict[str, threading.Event] = {}

# Active jobs tracking and thread synchronization
_jobs_lock = threading.Lock()
_active_job_ids: Set[str] = set()

# Hardware & resource-aware concurrency limit:
# Running 2 concurrent exports balances GPU MFT encoder sessions, memory, and CPU throughput
CPU_CORES = os.cpu_count() or 4
MAX_CONCURRENT_EXPORTS = min(2, max(1, CPU_CORES // 2))

_render_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=MAX_CONCURRENT_EXPORTS,
    thread_name_prefix="ExportWorker"
)

def get_active_export_count() -> int:
    """Returns the number of exports currently executing."""
    with _jobs_lock:
        return len(_active_job_ids)

def update_job_status(job_id: str, status: str, progress: float = 0.0, output_path: Optional[str] = None, error_message: Optional[str] = None):
    db: Session = SessionLocal()
    try:
        job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
        if job:
            # Do not overwrite cancelled status if cancellation occurred
            if job.status == "cancelled" and status not in ["cancelled"]:
                return
            job.status = status
            job.progress = progress
            if output_path:
                job.output_path = output_path
            if error_message:
                job.error_message = error_message
            if status in ["completed", "failed", "cancelled"]:
                job.completed_at = datetime.datetime.utcnow()
            db.commit()
    finally:
        db.close()

def enqueue_render_job(job_id: str, project_id: str, render_settings: Dict[str, Any]):
    """Queues a render job to be processed by the background export queue manager."""
    cancel_event = threading.Event()
    CANCEL_FLAGS[job_id] = cancel_event

    update_job_status(job_id, "queued", progress=0.0)
    print(f"[RenderService] Job {job_id} queued for project {project_id}. (Active: {get_active_export_count()}/{MAX_CONCURRENT_EXPORTS})")

    _render_executor.submit(_worker_wrapper, job_id, project_id, render_settings, cancel_event)

def _worker_wrapper(job_id: str, project_id: str, render_settings: Dict[str, Any], cancel_event: threading.Event):
    """Wrapper that executes queued jobs and manages resource locks."""
    if cancel_event.is_set():
        update_job_status(job_id, "cancelled", error_message="Export cancelled while queued.")
        CANCEL_FLAGS.pop(job_id, None)
        return

    with _jobs_lock:
        _active_job_ids.add(job_id)

    print(f"[RenderService] Starting export worker for job {job_id} (Project {project_id}). Active exports: {len(_active_job_ids)}/{MAX_CONCURRENT_EXPORTS}")

    try:
        run_render_task(job_id, project_id, render_settings, cancel_event)
    except Exception as e:
        print(f"[RenderService] Job {job_id} execution error: {e}")
        update_job_status(job_id, "failed", error_message=str(e))
    finally:
        with _jobs_lock:
            _active_job_ids.discard(job_id)
        CANCEL_FLAGS.pop(job_id, None)
        print(f"[RenderService] Finished export worker for job {job_id}. Remaining active: {len(_active_job_ids)}")

def run_render_task(job_id: str, project_id: str, render_settings: Dict[str, Any], cancel_event: Optional[threading.Event] = None):
    """Executes high-speed parallel rendering with fallback to Remotion."""
    if cancel_event and cancel_event.is_set():
        update_job_status(job_id, "cancelled", error_message="Export cancelled.")
        return

    db: Session = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        timeline_record = db.query(Timeline).filter(Timeline.project_id == project_id).first()
        if not project or not timeline_record:
            update_job_status(job_id, "failed", error_message="Project or timeline data not found.")
            return

        timeline_data = json.loads(timeline_record.timeline_json)
    finally:
        db.close()

    update_job_status(job_id, "rendering", progress=5.0)

    # 1. Prepare temp timeline JSON file for renderer
    temp_dir = os.path.join(STORAGE_DIR, "temp")
    os.makedirs(temp_dir, exist_ok=True)
    temp_timeline_path = os.path.join(temp_dir, f"timeline_{job_id}.json")
    
    with open(temp_timeline_path, "w", encoding="utf-8") as f:
        json.dump(timeline_data, f, indent=2)

    # Output MP4 path
    renders_dir = os.path.join(STORAGE_DIR, "renders")
    os.makedirs(renders_dir, exist_ok=True)
    output_mp4_path = os.path.join(renders_dir, f"render_{project_id}_{job_id[:8]}.mp4")

    # 1. Primary Engine: High-Speed Hardware Accelerated FFmpeg Pipeline
    try:
        from app.services.fast_render_engine import run_fast_render_pipeline
        print(f"[RenderService] Launching High-Speed Hardware Pipeline for job {job_id}...")

        def on_fast_progress(pct: float):
            if cancel_event and cancel_event.is_set():
                return
            update_job_status(job_id, "rendering", progress=pct)

        success = run_fast_render_pipeline(
            job_id=job_id,
            project_id=project_id,
            timeline_data=timeline_data,
            render_settings=render_settings,
            output_mp4_path=output_mp4_path,
            storage_dir=STORAGE_DIR,
            update_progress=on_fast_progress
        )

        if cancel_event and cancel_event.is_set():
            update_job_status(job_id, "cancelled", error_message="Export cancelled by user.")
            if os.path.exists(output_mp4_path):
                try: os.remove(output_mp4_path)
                except Exception: pass
            return

        if success and os.path.exists(output_mp4_path):
            update_job_status(job_id, "completed", progress=100.0, output_path=output_mp4_path)
            return
    except Exception as fast_err:
        if cancel_event and cancel_event.is_set():
            update_job_status(job_id, "cancelled", error_message="Export cancelled by user.")
            return
        print(f"[RenderService] Fast render pipeline notice for {job_id}: {fast_err}. Falling back to Remotion...")

    # 2. Secondary Engine: Optimized Remotion Composition Fallback
    if cancel_event and cancel_event.is_set():
        update_job_status(job_id, "cancelled", error_message="Export cancelled by user.")
        return

    script_path = os.path.join(BASE_DIR, "remotion", "render.mjs")
    cmd = [
        "node",
        script_path,
        "--timeline", temp_timeline_path,
        "--output", output_mp4_path,
        "--storageDir", STORAGE_DIR
    ]

    width = render_settings.get("width")
    height = render_settings.get("height")
    if not width or not height:
        ratio = render_settings.get("aspect_ratio")
        if ratio == "9:16":
            width, height = 1080, 1920
        elif ratio == "1:1":
            width, height = 1080, 1080
        elif ratio == "16:9":
            width, height = 1920, 1080

    if width:
        cmd.extend(["--width", str(width)])
    if height:
        cmd.extend(["--height", str(height)])
    if render_settings.get("fps"):
        cmd.extend(["--fps", str(render_settings["fps"])])
    if render_settings.get("quality"):
        cmd.extend(["--quality", str(render_settings["quality"])])

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            cwd=os.path.join(BASE_DIR, "remotion")
        )
        ACTIVE_RENDER_PROCESSES[job_id] = process

        for line in process.stdout:
            if cancel_event and cancel_event.is_set():
                process.kill()
                break
            line_str = line.strip()
            if line_str.startswith("PROGRESS:"):
                try:
                    prog_val = float(line_str.split(":")[1])
                    update_job_status(job_id, "rendering", progress=round(prog_val * 100, 1))
                except ValueError:
                    pass

        process.wait()
        ACTIVE_RENDER_PROCESSES.pop(job_id, None)

        if cancel_event and cancel_event.is_set():
            update_job_status(job_id, "cancelled", error_message="Export cancelled by user.")
            if os.path.exists(output_mp4_path):
                try: os.remove(output_mp4_path)
                except Exception: pass
            return

        if process.returncode == 0 and os.path.exists(output_mp4_path):
            update_job_status(job_id, "completed", progress=100.0, output_path=output_mp4_path)
        else:
            update_job_status(job_id, "failed", error_message=f"Rendering failed with exit code {process.returncode}")

    except Exception as e:
        ACTIVE_RENDER_PROCESSES.pop(job_id, None)
        update_job_status(job_id, "failed", error_message=str(e))
    finally:
        if os.path.exists(temp_timeline_path):
            try: os.remove(temp_timeline_path)
            except Exception: pass

def cancel_render_job(job_id: str) -> bool:
    """Cancels a specific render job without affecting other jobs."""
    if job_id in CANCEL_FLAGS:
        CANCEL_FLAGS[job_id].set()

    try:
        from app.services.fast_render_engine import cancel_fast_render
        cancel_fast_render(job_id)
    except Exception:
        pass

    if job_id in ACTIVE_RENDER_PROCESSES:
        proc = ACTIVE_RENDER_PROCESSES.pop(job_id, None)
        if proc:
            try: proc.kill()
            except Exception: pass

    update_job_status(job_id, "cancelled", error_message="Export cancelled by user.")
    print(f"[RenderService] Job {job_id} cancelled.")
    return True

def cleanup_stale_jobs_on_startup():
    """Marks any leftover rendering or queued jobs from a previous server session as failed."""
    db: Session = SessionLocal()
    try:
        stale_jobs = db.query(RenderJob).filter(RenderJob.status.in_(["rendering", "pending", "queued"])).all()
        for j in stale_jobs:
            j.status = "failed"
            j.error_message = "Server restarted while export was in progress"
            j.completed_at = datetime.datetime.utcnow()
        if stale_jobs:
            db.commit()
            print(f"[RenderService] Cleaned up {len(stale_jobs)} stale render job(s) from previous session.")
    except Exception as e:
        print(f"[RenderService] Stale jobs cleanup notice: {e}")
    finally:
        db.close()

# Run startup cleanup automatically upon import
cleanup_stale_jobs_on_startup()
