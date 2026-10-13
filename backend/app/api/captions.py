import os
import json
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db, STORAGE_DIR
from app.models import Project, Asset, Timeline, Sentence
from app.schemas.captions import (
    CaptionSettings,
    TimelineCaptions,
    CaptionGenerateRequest,
)
from app.services.caption_presets import get_preset_by_id
from app.services.caption_service import (
    generate_captions_from_audio,
    group_words_into_segments,
    export_captions_to_srt,
    export_captions_to_vtt,
)

router = APIRouter(prefix="/api/projects/{project_id}/captions", tags=["captions"])

def _get_project_timeline_data(project_id: str, db: Session) -> tuple[Timeline, dict]:
    timeline_record = db.query(Timeline).filter(Timeline.project_id == project_id).first()
    if not timeline_record:
        raise HTTPException(status_code=404, detail="Timeline not found for project")
    try:
        data = json.loads(timeline_record.timeline_json)
    except Exception:
        data = {}
    return timeline_record, data

@router.post("/generate", response_model=TimelineCaptions)
def generate_captions(
    project_id: str,
    req: CaptionGenerateRequest = None,
    db: Session = Depends(get_db)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    settings_dict = {}
    try:
        settings_dict = json.loads(project.settings_json or "{}")
    except Exception:
        pass

    audio_asset = None
    if settings_dict.get("active_audio_id"):
        audio_asset = db.query(Asset).filter(Asset.id == settings_dict["active_audio_id"], Asset.project_id == project_id).first()

    if not audio_asset:
        audio_asset = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "audio").order_by(Asset.order_index.asc()).first()

    if not audio_asset:
        # Also support voiceover from uploaded video assets
        audio_asset = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "video").order_by(Asset.order_index.asc()).first()

    if not audio_asset:
        raise HTTPException(status_code=400, detail="No voiceover audio or video found in this project. Please upload an audio or video file first.")

    audio_full_path = os.path.normpath(os.path.join(STORAGE_DIR, audio_asset.storage_path))
    if not os.path.exists(audio_full_path):
        if os.path.isabs(audio_asset.storage_path) and os.path.exists(audio_asset.storage_path):
            audio_full_path = audio_asset.storage_path
        else:
            raise HTTPException(status_code=404, detail=f"Audio file '{audio_asset.original_name}' not found on server storage.")

    timeline_record = db.query(Timeline).filter(Timeline.project_id == project_id).first()
    fps = 30
    timeline_data = {}
    if timeline_record:
        try:
            timeline_data = json.loads(timeline_record.timeline_json)
            fps = timeline_data.get("settings", {}).get("fps", 30)
        except Exception:
            pass

    preset_id = req.preset_id if req and req.preset_id else "preset_yellow_karaoke"
    mode = req.mode if req and req.mode else "karaoke"
    words_per_segment = req.words_per_segment if req and req.words_per_segment else 5

    try:
        captions = generate_captions_from_audio(
            audio_path=audio_full_path,
            fps=fps,
            user_script=project.script,
            preset_id=preset_id,
            mode=mode,
            words_per_segment=words_per_segment
        )

        # Always keep Sentence records in database synchronized with generated caption segments
        if captions.segments:
            db.query(Sentence).filter(Sentence.project_id == project_id).delete()
            for s_i, seg in enumerate(captions.segments):
                w_payload = [
                    {"word": cw.text, "start": cw.start_time, "end": cw.end_time, "conf": cw.confidence}
                    for cw in (seg.words or [])
                ]
                sent_record = Sentence(
                    id=f"sent_{s_i+1:03d}_{uuid.uuid4().hex[:6]}",
                    project_id=project_id,
                    order_index=s_i,
                    text=seg.text,
                    start_time=seg.start_time or 0.0,
                    end_time=seg.end_time or 0.0,
                    confidence=1.0,
                    words_json=json.dumps(w_payload)
                )
                db.add(sent_record)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Caption speech transcription failed: {str(e)}")

    # Save to timeline_json
    timeline_data["captions"] = captions.model_dump(by_alias=True)
    if not timeline_record:
        timeline_record = Timeline(
            id=f"tl_{project_id[:8]}",
            project_id=project_id,
            timeline_json=json.dumps(timeline_data)
        )
        db.add(timeline_record)
    else:
        timeline_record.timeline_json = json.dumps(timeline_data)

    db.commit()
    return captions

@router.get("", response_model=Optional[TimelineCaptions])
def get_captions(project_id: str, db: Session = Depends(get_db)):
    _, timeline_data = _get_project_timeline_data(project_id, db)
    captions_data = timeline_data.get("captions")
    if not captions_data:
        return None
    return TimelineCaptions(**captions_data)

@router.put("", response_model=TimelineCaptions)
def update_captions(project_id: str, captions: TimelineCaptions, db: Session = Depends(get_db)):
    timeline_record, timeline_data = _get_project_timeline_data(project_id, db)
    timeline_data["captions"] = captions.model_dump(by_alias=True)
    timeline_record.timeline_json = json.dumps(timeline_data)
    db.commit()
    return captions

@router.delete("")
def delete_captions(project_id: str, db: Session = Depends(get_db)):
    timeline_record, timeline_data = _get_project_timeline_data(project_id, db)
    timeline_data["captions"] = None
    timeline_record.timeline_json = json.dumps(timeline_data)
    db.commit()
    return {"status": "deleted"}

@router.get("/export/srt")
def export_srt(project_id: str, db: Session = Depends(get_db)):
    _, timeline_data = _get_project_timeline_data(project_id, db)
    captions_data = timeline_data.get("captions")
    if not captions_data or not captions_data.get("segments"):
        raise HTTPException(status_code=404, detail="No caption segments available to export")
    
    captions = TimelineCaptions(**captions_data)
    srt_content = export_captions_to_srt(captions.segments)
    
    return PlainTextResponse(
        content=srt_content,
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="captions_{project_id[:8]}.srt"'
        }
    )

@router.get("/export/vtt")
def export_vtt(project_id: str, db: Session = Depends(get_db)):
    _, timeline_data = _get_project_timeline_data(project_id, db)
    captions_data = timeline_data.get("captions")
    if not captions_data or not captions_data.get("segments"):
        raise HTTPException(status_code=404, detail="No caption segments available to export")
    
    captions = TimelineCaptions(**captions_data)
    vtt_content = export_captions_to_vtt(captions.segments)
    
    return PlainTextResponse(
        content=vtt_content,
        media_type="text/vtt",
        headers={
            "Content-Disposition": f'attachment; filename="captions_{project_id[:8]}.vtt"'
        }
    )
