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

    # Check if we already have transcribed sentences with word alignment for this project
    existing_sentences = db.query(Sentence).filter(Sentence.project_id == project_id).order_by(Sentence.order_index).all()
    cached_words = []
    if existing_sentences:
        for s in existing_sentences:
            if s.words_json:
                try:
                    w_list = json.loads(s.words_json)
                    if isinstance(w_list, list) and len(w_list) > 0:
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

    try:
        if cached_words:
            segments = group_words_into_segments(
                raw_words=cached_words,
                fps=fps,
                words_per_segment=words_per_segment,
                user_script=project.script
            )
            from app.schemas.captions import CaptionStyle
            preset = get_preset_by_id(preset_id)
            preset_style = CaptionStyle(**preset["style"])
            captions = TimelineCaptions(
                settings=CaptionSettings(
                    enabled=True,
                    selectedPresetId=preset.get("id", "preset_yellow_karaoke"),
                    mode=mode or preset.get("mode", "karaoke"),
                    globalStyle=preset_style
                ),
                segments=segments
            )
        else:
            captions = generate_captions_from_audio(
                audio_path=audio_full_path,
                fps=fps,
                user_script=project.script,
                preset_id=preset_id,
                mode=mode,
                words_per_segment=words_per_segment
            )
            # If no sentences existed in DB yet, auto-create Sentence records so timeline alignment is in sync
            if not existing_sentences and captions.segments:
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
