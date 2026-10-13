import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db, STORAGE_DIR
from app.models import Project, Asset, Sentence
from app.schemas import SentenceItem, SentenceUpdate
from app.services.sentence_aligner import analyze_and_segment_audio
from app.services.audio_analyzer import generate_waveform_points

router = APIRouter(prefix="/api/projects/{project_id}", tags=["transcription"])

@router.post("/analyze-audio", response_model=List[SentenceItem])
def analyze_audio(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    audio_asset = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "audio").first()
    if not audio_asset:
        raise HTTPException(status_code=400, detail="No voiceover audio found in this project. Please upload audio first.")

    audio_full_path = os.path.join(STORAGE_DIR, audio_asset.storage_path)
    if not os.path.exists(audio_full_path):
        raise HTTPException(status_code=404, detail="Audio file on disk missing.")

    # Run analysis with optional user script
    try:
        segments = analyze_and_segment_audio(audio_full_path, user_script=project.script)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio analysis failed: {str(e)}")

    # Clear previous sentences
    old_sentences = db.query(Sentence).filter(Sentence.project_id == project_id).all()
    for s in old_sentences:
        db.delete(s)

    saved_sentences = []
    for idx, seg in enumerate(segments):
        sent_id = f"sent_{idx+1:03d}_{uuid.uuid4().hex[:6]}"
        sent = Sentence(
            id=sent_id,
            project_id=project_id,
            order_index=idx,
            text=seg["text"],
            start_time=seg["start"],
            end_time=seg["end"],
            confidence=seg.get("confidence", 1.0)
        )
        db.add(sent)
        saved_sentences.append(sent)

    db.commit()

    return [
        SentenceItem(
            id=s.id,
            order_index=s.order_index,
            text=s.text,
            start_time=s.start_time,
            end_time=s.end_time,
            confidence=s.confidence
        )
        for s in saved_sentences
    ]

@router.get("/sentences", response_model=List[SentenceItem])
def get_sentences(project_id: str, db: Session = Depends(get_db)):
    sentences = db.query(Sentence).filter(Sentence.project_id == project_id).order_by(Sentence.order_index.asc()).all()
    return [
        SentenceItem(
            id=s.id,
            order_index=s.order_index,
            text=s.text,
            start_time=s.start_time,
            end_time=s.end_time,
            confidence=s.confidence
        )
        for s in sentences
    ]

@router.put("/sentences", response_model=List[SentenceItem])
def update_sentences(project_id: str, req: SentenceUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Clear old and replace with new
    old_sentences = db.query(Sentence).filter(Sentence.project_id == project_id).all()
    for s in old_sentences:
        db.delete(s)

    new_list = []
    for idx, item in enumerate(req.sentences):
        sent = Sentence(
            id=item.id or f"sent_{idx+1:03d}_{uuid.uuid4().hex[:6]}",
            project_id=project_id,
            order_index=idx,
            text=item.text,
            start_time=item.start_time,
            end_time=item.end_time,
            confidence=item.confidence
        )
        db.add(sent)
        new_list.append(sent)

    db.commit()
    return [
        SentenceItem(
            id=s.id,
            order_index=s.order_index,
            text=s.text,
            start_time=s.start_time,
            end_time=s.end_time,
            confidence=s.confidence
        )
        for s in new_list
    ]

@router.get("/audio/waveform")
def get_audio_waveform(project_id: str, db: Session = Depends(get_db)):
    audio_asset = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "audio").first()
    if not audio_asset:
        raise HTTPException(status_code=404, detail="No audio file in project")
    
    full_path = os.path.join(STORAGE_DIR, audio_asset.storage_path)
    points = generate_waveform_points(full_path, num_points=200)
    return {"points": points, "duration": audio_asset.duration}
