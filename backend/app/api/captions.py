import os
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db, STORAGE_DIR
from app.models import Project, Asset, Timeline
from app.schemas.captions import (
    TimelineCaptions,
    CaptionGenerateRequest,
)
from app.services.caption_service import (
    generate_captions_from_audio,
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

    audio_asset = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "audio").first()
    if not audio_asset:
        raise HTTPException(status_code=400, detail="No voiceover audio found in this project. Please upload audio first.")

    audio_full_path = os.path.join(STORAGE_DIR, audio_asset.storage_path)
    if not os.path.exists(audio_full_path):
        raise HTTPException(status_code=404, detail="Audio file on disk missing.")

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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Caption generation failed: {str(e)}")

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
