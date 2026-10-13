import os
import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db, STORAGE_DIR
from app.models import Project, Asset, Sentence, Timeline, RenderJob
from app.schemas import TimelineData, RenderRequest, RenderJobResponse, ProjectSettings
from app.services.timeline_generator import generate_timeline
from app.services.render_service import enqueue_render_job, cancel_render_job

router = APIRouter(tags=["timeline_and_rendering"])

def format_job_response(job: RenderJob, db: Session) -> RenderJobResponse:
    download_url = f"/api/render-jobs/{job.id}/download" if job.status == "completed" and job.output_path else None
    
    queue_pos = None
    if job.status == "queued":
        ahead = db.query(RenderJob).filter(
            RenderJob.status == "queued",
            RenderJob.created_at < job.created_at
        ).count()
        queue_pos = ahead + 1

    proj = db.query(Project).filter(Project.id == job.project_id).first()
    proj_name = proj.name if proj else None

    return RenderJobResponse(
        id=job.id,
        project_id=job.project_id,
        project_name=proj_name,
        status=job.status,
        progress=job.progress,
        output_path=job.output_path,
        error_message=job.error_message,
        created_at=job.created_at.isoformat() if job.created_at else "",
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        download_url=download_url,
        queue_position=queue_pos
    )

@router.post("/api/projects/{project_id}/generate-timeline", response_model=TimelineData)
def auto_generate_timeline(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    visual_assets = db.query(Asset).filter(
        Asset.project_id == project_id,
        Asset.type.in_(["image", "video"])
    ).order_by(Asset.order_index.asc()).all()
    if not visual_assets:
        raise HTTPException(status_code=400, detail="Please upload at least one image or video clip before generating a timeline.")

    settings_dict = json.loads(project.settings_json or "{}")
    active_audio_id = settings_dict.get("active_audio_id")
    audio_asset = None
    if active_audio_id:
        audio_asset = db.query(Asset).filter(Asset.project_id == project_id, Asset.id == active_audio_id).first()
    if not audio_asset:
        audio_asset = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "audio").order_by(Asset.order_index.asc()).first()

    sentences = db.query(Sentence).filter(Sentence.project_id == project_id).order_by(Sentence.order_index.asc()).all()

    # If voiceover audio exists but sentences have not been analyzed yet, automatically analyze now!
    if audio_asset:
        audio_full_path = os.path.join(STORAGE_DIR, audio_asset.storage_path)
        if os.path.exists(audio_full_path):
            from app.services.sentence_aligner import analyze_and_segment_audio
            if not sentences:
                try:
                    segments = analyze_and_segment_audio(audio_full_path, user_script=project.script)
                    if segments:
                        for idx, seg in enumerate(segments):
                            sent_id = f"sent_{idx+1:03d}_{uuid.uuid4().hex[:6]}"
                            sent = Sentence(
                                id=sent_id,
                                project_id=project_id,
                                order_index=idx,
                                text=seg["text"],
                                start_time=seg["start"],
                                end_time=seg["end"],
                                confidence=seg.get("confidence", 1.0),
                                words_json=json.dumps(seg.get("words") or [])
                            )
                            db.add(sent)
                        db.commit()
                        sentences = db.query(Sentence).filter(Sentence.project_id == project_id).order_by(Sentence.order_index.asc()).all()
                except Exception as e:
                    print(f"[TimelineGeneration] Voiceover analysis notice: {e}")
            else:
                # If sentences exist but don't have word timestamps, populate them
                has_any_words = any(
                    bool(getattr(s, "words_json", None) and json.loads(s.words_json))
                    for s in sentences
                )
                if not has_any_words:
                    try:
                        segments = analyze_and_segment_audio(audio_full_path, user_script=project.script)
                        if segments and len(segments) == len(sentences):
                            for idx, s in enumerate(sentences):
                                s.words_json = json.dumps(segments[idx].get("words") or [])
                            db.commit()
                    except Exception as e:
                        print(f"[TimelineGeneration] Word alignment notice: {e}")

    settings_dict = json.loads(project.settings_json or "{}")
    settings = ProjectSettings(**settings_dict)

    image_ids = [v.id for v in visual_assets]
    sentences_data = [
        {
            "id": s.id,
            "text": s.text,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "words": (json.loads(s.words_json) if getattr(s, "words_json", None) and s.words_json else [])
        }
        for s in sentences
    ]

    try:
        timeline_data = generate_timeline(
            project_id=project_id,
            settings=settings,
            image_ids=image_ids,
            sentences=sentences_data,
            audio_asset_id=audio_asset.id if audio_asset else None,
            total_audio_duration=audio_asset.duration if audio_asset else None
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Persist timeline preserving any existing captions, or auto-generating if none exist
    existing_tl = db.query(Timeline).filter(Timeline.project_id == project_id).first()
    if existing_tl and existing_tl.timeline_json:
        try:
            old_data = json.loads(existing_tl.timeline_json)
            if old_data.get("captions") and not timeline_data.captions:
                from app.schemas.captions import TimelineCaptions
                timeline_data.captions = TimelineCaptions(**old_data["captions"])
        except Exception:
            pass

    # If timeline has no captions and voiceover audio exists, automatically generate synchronized captions
    if not timeline_data.captions and audio_asset:
        audio_full_path = os.path.join(STORAGE_DIR, audio_asset.storage_path)
        if os.path.exists(audio_full_path):
            try:
                fps = settings.fps or 30
                cached_words = []
                for s in sentences:
                    if getattr(s, "words_json", None):
                        try:
                            w_list = json.loads(s.words_json)
                            if isinstance(w_list, list):
                                for w in w_list:
                                    cached_words.append({
                                        "id": f"word_{len(cached_words)+1:04d}",
                                        "word": w.get("word", "").strip(),
                                        "start": float(w.get("start", 0.0)),
                                        "end": float(w.get("end", 0.0)),
                                        "conf": float(w.get("conf", w.get("confidence", 1.0))),
                                    })
                        except Exception:
                            pass

                if cached_words:
                    from app.services.caption_service import group_words_into_segments
                    from app.services.caption_presets import get_preset_by_id
                    from app.schemas.captions import CaptionSettings, TimelineCaptions
                    segments = group_words_into_segments(raw_words=cached_words, fps=fps, user_script=project.script)
                    preset = get_preset_by_id("preset_yellow_karaoke")
                    from app.schemas.captions import CaptionStyle
                    preset_style = CaptionStyle(**preset["style"])
                    timeline_data.captions = TimelineCaptions(
                        settings=CaptionSettings(
                            enabled=True,
                            selectedPresetId=preset.get("id", "preset_yellow_karaoke"),
                            mode=preset.get("mode", "karaoke"),
                            globalStyle=preset_style
                        ),
                        segments=segments
                    )
                else:
                    from app.services.caption_service import generate_captions_from_audio
                    timeline_data.captions = generate_captions_from_audio(
                        audio_path=audio_full_path,
                        fps=fps,
                        user_script=project.script
                    )
            except Exception as e:
                print(f"[TimelineGeneration] Auto-generate captions notice: {e}")

    dump_data = timeline_data.model_dump(by_alias=True) if hasattr(timeline_data, "model_dump") else timeline_data.dict(by_alias=True)
    if not existing_tl:
        existing_tl = Timeline(
            id=f"tl_{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            timeline_json=json.dumps(dump_data)
        )
        db.add(existing_tl)
    else:
        existing_tl.timeline_json = json.dumps(dump_data)

    db.commit()
    return timeline_data

@router.get("/api/projects/{project_id}/timeline", response_model=TimelineData)
def get_timeline(project_id: str, db: Session = Depends(get_db)):
    tl = db.query(Timeline).filter(Timeline.project_id == project_id).first()
    if not tl:
        raise HTTPException(status_code=404, detail="Timeline not found")
    data = json.loads(tl.timeline_json)
    return TimelineData(**data)

@router.put("/api/projects/{project_id}/timeline", response_model=TimelineData)
def update_timeline(project_id: str, timeline_data: TimelineData, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    dump_data = timeline_data.model_dump(by_alias=True) if hasattr(timeline_data, "model_dump") else timeline_data.dict(by_alias=True)
    tl = db.query(Timeline).filter(Timeline.project_id == project_id).first()
    if not tl:
        tl = Timeline(
            id=f"tl_{uuid.uuid4().hex[:8]}",
            project_id=project_id,
            timeline_json=json.dumps(dump_data)
        )
        db.add(tl)
    else:
        tl.timeline_json = json.dumps(dump_data)

    db.commit()
    return timeline_data

@router.post("/api/projects/{project_id}/render", response_model=RenderJobResponse)
def trigger_render(project_id: str, req: RenderRequest, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tl = db.query(Timeline).filter(Timeline.project_id == project_id).first()
    if not tl:
        raise HTTPException(status_code=400, detail="Cannot render video: No timeline exists. Generate timeline first.")

    # Validation: Ensure scenes exist and have valid non-negative durations
    try:
        tl_content = json.loads(tl.timeline_json or "{}")
        tl_scenes = tl_content.get("scenes", [])
        if not tl_scenes:
            raise HTTPException(status_code=400, detail="Timeline has no visual scenes. Please add images or generate timeline.")
        for sc in tl_scenes:
            if not sc.get("imageAssetId"):
                raise HTTPException(status_code=400, detail=f"Scene {sc.get('id')} is missing an image asset.")
            if sc.get("durationFrames", 0) <= 0:
                raise HTTPException(status_code=400, detail=f"Scene {sc.get('id')} has invalid duration ({sc.get('durationFrames')}).")
    except HTTPException:
        raise
    except Exception as val_err:
        raise HTTPException(status_code=400, detail=f"Timeline validation failed: {val_err}")

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    job = RenderJob(
        id=job_id,
        project_id=project_id,
        status="queued",
        progress=0.0
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Queue export job in background resource-managed queue
    enqueue_render_job(job_id, project_id, req.dict())

    return format_job_response(job, db)

@router.get("/api/render-jobs", response_model=List[RenderJobResponse])
def get_all_render_jobs(db: Session = Depends(get_db)):
    """Returns all recent and active render jobs across all projects."""
    jobs = db.query(RenderJob).order_by(RenderJob.created_at.desc()).limit(50).all()
    return [format_job_response(j, db) for j in jobs]

@router.get("/api/projects/{project_id}/latest-render-job", response_model=Optional[RenderJobResponse])
def get_latest_render_job_for_project(project_id: str, db: Session = Depends(get_db)):
    """Returns the most recent render job for a given project, or null if none."""
    job = db.query(RenderJob).filter(RenderJob.project_id == project_id).order_by(RenderJob.created_at.desc()).first()
    if not job:
        return None
    return format_job_response(job, db)

@router.get("/api/projects/{project_id}/render-jobs", response_model=List[RenderJobResponse])
def get_project_render_jobs(project_id: str, db: Session = Depends(get_db)):
    """Returns all render jobs for a specific project."""
    jobs = db.query(RenderJob).filter(RenderJob.project_id == project_id).order_by(RenderJob.created_at.desc()).all()
    return [format_job_response(j, db) for j in jobs]

@router.get("/api/render-jobs/{job_id}", response_model=RenderJobResponse)
def get_render_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Render job not found")
    return format_job_response(job, db)

@router.post("/api/render-jobs/{job_id}/cancel")
def cancel_render(job_id: str):
    success = cancel_render_job(job_id)
    return {"message": "Job cancellation requested", "success": success}

@router.get("/api/render-jobs/{job_id}/download")
def download_rendered_video(job_id: str, db: Session = Depends(get_db)):
    job = db.query(RenderJob).filter(RenderJob.id == job_id).first()
    if not job or not job.output_path or not os.path.exists(job.output_path):
        raise HTTPException(status_code=404, detail="Rendered video file not found")

    project = db.query(Project).filter(Project.id == job.project_id).first()
    clean_name = "AutoVideo_Export"
    if project and project.name:
        import re
        clean_name = re.sub(r'[^a-zA-Z0-9_\-\s]', '', project.name).strip().replace(' ', '_') or "AutoVideo_Export"

    filename = f"{clean_name}_{job_id[:8]}.mp4"

    return FileResponse(
        path=job.output_path,
        media_type="video/mp4",
        filename=filename,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache"
        }
    )

