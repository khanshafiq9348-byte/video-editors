import os
import uuid
import json
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from app.database import get_db, STORAGE_DIR
from app.models import Project, Asset
from app.schemas import AssetResponse, UploadBatchResponse
from app.services.audio_analyzer import get_media_metadata

router = APIRouter(prefix="/api/projects/{project_id}", tags=["uploads"])

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tiff", ".jfif", ".avif"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".flv", ".wmv"}
ALLOWED_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".wma"}

ALLOWED_VISUAL_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS
ALL_SUPPORTED_EXTENSIONS = ALLOWED_VISUAL_EXTENSIONS | ALLOWED_AUDIO_EXTENSIONS

def natural_sort_key(filename: str):
    """Natural sort key for filenames (e.g. 1.png, 2.png, 10.png)."""
    name = filename or ""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r'(\d+)', name)]

@router.post("/media", response_model=UploadBatchResponse)
async def upload_media_batch(
    project_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    Unified multi-file and folder upload endpoint.
    Accepts images, video clips, and voiceover audio in one batch.
    Preserves original filenames and natural sorting, reports any unsupported files clearly.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    target_dir = os.path.join(STORAGE_DIR, "projects", project_id, "assets")
    os.makedirs(target_dir, exist_ok=True)

    current_visual_count = db.query(Asset).filter(
        Asset.project_id == project_id,
        Asset.type.in_(["image", "video"])
    ).count()

    current_audio_count = db.query(Asset).filter(
        Asset.project_id == project_id,
        Asset.type == "audio"
    ).count()

    uploaded_assets = []
    unsupported_files = []

    # Sort files naturally by filename
    sorted_files = sorted(files, key=lambda f: natural_sort_key(f.filename))

    for file in sorted_files:
        filename = file.filename or "unnamed_file"
        ext = os.path.splitext(filename)[1].lower()

        if ext not in ALL_SUPPORTED_EXTENSIONS:
            unsupported_files.append({
                "filename": filename,
                "reason": f"Unsupported format '{ext}'. Supported: Images (PNG, JPG, WEBP, BMP, GIF, TIFF, AVIF), Videos (MP4, MOV, WEBM, MKV, AVI), Audio (MP3, WAV, M4A, AAC, OGG, FLAC)."
            })
            continue

        # Classify asset type
        if ext in ALLOWED_IMAGE_EXTENSIONS:
            asset_type = "image"
            prefix = "img"
            order_idx = current_visual_count
            current_visual_count += 1
        elif ext in ALLOWED_VIDEO_EXTENSIONS:
            asset_type = "video"
            prefix = "vid"
            order_idx = current_visual_count
            current_visual_count += 1
        else:
            asset_type = "audio"
            prefix = "aud"
            order_idx = current_audio_count
            current_audio_count += 1

        asset_id = f"{prefix}_{uuid.uuid4().hex[:8]}"
        saved_filename = f"{asset_id}{ext}"
        save_path = os.path.join(target_dir, saved_filename)

        with open(save_path, "wb") as f:
            content = await file.read()
            f.write(content)

        meta = get_media_metadata(save_path)
        rel_storage_path = os.path.relpath(save_path, STORAGE_DIR)

        asset = Asset(
            id=asset_id,
            project_id=project_id,
            type=asset_type,
            original_name=filename,
            storage_path=rel_storage_path,
            duration=meta.get("duration"),
            width=meta.get("width"),
            height=meta.get("height"),
            order_index=order_idx,
            metadata_json=json.dumps(meta)
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)

        # In single_language mode, if audio is uploaded and none active, set as active
        settings_dict = json.loads(project.settings_json or "{}")
        if asset_type == "audio" and not settings_dict.get("active_audio_id"):
            settings_dict["active_audio_id"] = asset_id
            project.settings_json = json.dumps(settings_dict)
            db.commit()

        uploaded_assets.append(AssetResponse(
            id=asset.id,
            project_id=asset.project_id,
            type=asset.type,
            original_name=asset.original_name,
            storage_path=asset.storage_path,
            duration=asset.duration,
            width=asset.width,
            height=asset.height,
            order_index=asset.order_index,
            url=f"/storage/{rel_storage_path.replace(chr(92), '/')}"
        ))

    return UploadBatchResponse(
        uploaded=uploaded_assets,
        unsupported=unsupported_files,
        total_uploaded=len(uploaded_assets)
    )

@router.post("/images", response_model=List[AssetResponse])
async def upload_images(project_id: str, files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    """Uploads visual assets (images and video clips), naturally sorted by filename."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    target_dir = os.path.join(STORAGE_DIR, "projects", project_id, "assets")
    os.makedirs(target_dir, exist_ok=True)

    current_count = db.query(Asset).filter(
        Asset.project_id == project_id,
        Asset.type.in_(["image", "video"])
    ).count()
    uploaded_assets = []

    sorted_files = sorted(files, key=lambda f: natural_sort_key(f.filename))

    for file in sorted_files:
        filename = file.filename or "unnamed_file"
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_VISUAL_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format '{ext}' for file '{filename}'. Allowed visual formats: Images ({', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}) and Video Clips ({', '.join(sorted(ALLOWED_VIDEO_EXTENSIONS))})."
            )

        asset_type = "video" if ext in ALLOWED_VIDEO_EXTENSIONS else "image"
        prefix = "vid" if asset_type == "video" else "img"
        asset_id = f"{prefix}_{uuid.uuid4().hex[:8]}"
        saved_filename = f"{asset_id}{ext}"
        save_path = os.path.join(target_dir, saved_filename)

        with open(save_path, "wb") as f:
            content = await file.read()
            f.write(content)

        meta = get_media_metadata(save_path)
        rel_storage_path = os.path.relpath(save_path, STORAGE_DIR)

        asset = Asset(
            id=asset_id,
            project_id=project_id,
            type=asset_type,
            original_name=filename,
            storage_path=rel_storage_path,
            duration=meta.get("duration"),
            width=meta.get("width"),
            height=meta.get("height"),
            order_index=current_count,
            metadata_json=json.dumps(meta)
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
        current_count += 1

        uploaded_assets.append(AssetResponse(
            id=asset.id,
            project_id=asset.project_id,
            type=asset.type,
            original_name=asset.original_name,
            storage_path=asset.storage_path,
            duration=asset.duration,
            width=asset.width,
            height=asset.height,
            order_index=asset.order_index,
            url=f"/storage/{rel_storage_path.replace(chr(92), '/')}"
        ))

    return uploaded_assets

@router.post("/audio", response_model=AssetResponse)
async def upload_audio(
    project_id: str,
    file: UploadFile = File(...),
    language: Optional[str] = Query(None),
    replace: bool = Query(False),
    db: Session = Depends(get_db)
):
    """
    Uploads voiceover audio. Supports both Single-Language and Multi-Language project modes.
    In Single-Language mode, replaces or sets the primary audio.
    In Multi-Language mode, adds a new language track.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    filename = file.filename or "audio_track"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}"
        )

    target_dir = os.path.join(STORAGE_DIR, "projects", project_id, "assets")
    os.makedirs(target_dir, exist_ok=True)

    asset_id = f"aud_{uuid.uuid4().hex[:8]}"
    saved_filename = f"{asset_id}{ext}"
    save_path = os.path.join(target_dir, saved_filename)

    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    meta = get_media_metadata(save_path)
    rel_storage_path = os.path.relpath(save_path, STORAGE_DIR)

    settings_dict = json.loads(project.settings_json or "{}")
    project_mode = settings_dict.get("project_mode", "single_language")

    if project_mode == "single_language" or replace:
        # Delete previous audio asset in single-language mode
        old_audio = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "audio").all()
        for oa in old_audio:
            try:
                oa_path = os.path.join(STORAGE_DIR, oa.storage_path)
                if os.path.exists(oa_path) and oa_path != save_path:
                    os.remove(oa_path)
            except Exception:
                pass
            db.delete(oa)
        order_idx = 0
    else:
        # Multi-language mode: keep existing tracks and append
        order_idx = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "audio").count()

    meta["language"] = language or (settings_dict.get("primary_language", "en") if order_idx == 0 else f"track_{order_idx+1}")

    asset = Asset(
        id=asset_id,
        project_id=project_id,
        type="audio",
        original_name=filename,
        storage_path=rel_storage_path,
        duration=meta.get("duration"),
        order_index=order_idx,
        metadata_json=json.dumps(meta)
    )
    db.add(asset)

    # Set as active audio if no active audio yet or if replacing
    if not settings_dict.get("active_audio_id") or project_mode == "single_language" or replace:
        settings_dict["active_audio_id"] = asset_id
        project.settings_json = json.dumps(settings_dict)

    db.commit()
    db.refresh(asset)

    return AssetResponse(
        id=asset.id,
        project_id=asset.project_id,
        type=asset.type,
        original_name=asset.original_name,
        storage_path=asset.storage_path,
        duration=asset.duration,
        width=None,
        height=None,
        order_index=asset.order_index,
        url=f"/storage/{rel_storage_path.replace(chr(92), '/')}"
    )

@router.post("/active-audio/{asset_id}")
def set_active_audio(project_id: str, asset_id: str, db: Session = Depends(get_db)):
    """Sets the active voiceover audio track for the project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.project_id == project_id, Asset.type == "audio").first()
    if not asset:
        raise HTTPException(status_code=404, detail="Audio asset not found")

    settings_dict = json.loads(project.settings_json or "{}")
    settings_dict["active_audio_id"] = asset_id
    project.settings_json = json.dumps(settings_dict)
    db.commit()
    return {"message": "Active audio track updated", "active_audio_id": asset_id}

@router.delete("/assets/{asset_id}")
def delete_asset(project_id: str, asset_id: str, db: Session = Depends(get_db)):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.project_id == project_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    full_path = os.path.join(STORAGE_DIR, asset.storage_path)
    if os.path.exists(full_path):
        try:
            os.remove(full_path)
        except Exception:
            pass

    # If this was active audio, unset or pick another audio
    project = db.query(Project).filter(Project.id == project_id).first()
    if project:
        settings_dict = json.loads(project.settings_json or "{}")
        if settings_dict.get("active_audio_id") == asset_id:
            next_audio = db.query(Asset).filter(Asset.project_id == project_id, Asset.type == "audio", Asset.id != asset_id).first()
            settings_dict["active_audio_id"] = next_audio.id if next_audio else None
            project.settings_json = json.dumps(settings_dict)

    db.delete(asset)
    db.commit()
    return {"message": "Asset deleted successfully"}
