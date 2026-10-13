import uuid
import json
import shutil
import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db, STORAGE_DIR
from app.models import Project, Asset, Sentence, Timeline, RenderJob
from app.schemas import ProjectCreate, ProjectUpdate, ProjectDetail, ProjectSettings, AssetResponse, SentenceItem, TimelineData

router = APIRouter(prefix="/api/projects", tags=["projects"])

@router.post("", response_model=ProjectDetail)
def create_project(req: ProjectCreate, db: Session = Depends(get_db)):
    proj_id = f"proj_{uuid.uuid4().hex[:8]}"
    settings = req.settings or ProjectSettings()
    
    # Map aspect ratio to proper video canvas dimensions
    if settings.aspect_ratio == "9:16":
        settings.width = 1080
        settings.height = 1920
    elif settings.aspect_ratio == "1:1":
        settings.width = 1080
        settings.height = 1080
    elif settings.aspect_ratio == "16:9":
        settings.width = 1920
        settings.height = 1080
    else:
        # Deduce from width/height if custom
        if settings.width == 1080 and settings.height == 1920:
            settings.aspect_ratio = "9:16"
        elif settings.width == settings.height:
            settings.aspect_ratio = "1:1"
        else:
            settings.aspect_ratio = "16:9"

    project = Project(
        id=proj_id,
        name=req.name,
        settings_json=json.dumps(settings.dict())
    )
    db.add(project)
    
    # Initialize empty timeline
    timeline_data = TimelineData(
        projectId=proj_id,
        settings=settings,
        scenes=[],
        totalDurationFrames=0
    )
    timeline = Timeline(
        id=f"tl_{uuid.uuid4().hex[:8]}",
        project_id=proj_id,
        timeline_json=json.dumps(timeline_data.dict())
    )
    db.add(timeline)
    db.commit()
    db.refresh(project)

    # Ensure project storage folders exist
    proj_dir = os.path.join(STORAGE_DIR, "projects", proj_id, "assets")
    os.makedirs(proj_dir, exist_ok=True)

    return get_project_detail(project, db)

@router.get("", response_model=List[ProjectDetail])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.updated_at.desc()).all()
    return [get_project_detail(p, db) for p in projects]

@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return get_project_detail(project, db)

@router.put("/{project_id}", response_model=ProjectDetail)
def update_project(project_id: str, req: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if req.name is not None:
        project.name = req.name
    if req.settings is not None:
        project.settings_json = json.dumps(req.settings.dict())
    if req.script is not None:
        project.script = req.script

    db.commit()
    db.refresh(project)
    return get_project_detail(project, db)

@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete project assets directory
    proj_dir = os.path.join(STORAGE_DIR, "projects", project_id)
    if os.path.exists(proj_dir):
        shutil.rmtree(proj_dir, ignore_errors=True)

    db.delete(project)
    db.commit()
    return {"message": "Project deleted successfully"}

def get_project_detail(project: Project, db: Session) -> ProjectDetail:
    settings_dict = json.loads(project.settings_json or "{}")
    if "aspect_ratio" not in settings_dict:
        w = settings_dict.get("width", 1920)
        h = settings_dict.get("height", 1080)
        if w == 1080 and h == 1920:
            settings_dict["aspect_ratio"] = "9:16"
        elif w == h:
            settings_dict["aspect_ratio"] = "1:1"
        else:
            settings_dict["aspect_ratio"] = "16:9"
    settings = ProjectSettings(**settings_dict)

    assets_res: List[AssetResponse] = []
    for a in project.assets:
        # Build accessible URL
        rel_path = a.storage_path.replace("\\", "/")
        assets_res.append(AssetResponse(
            id=a.id,
            project_id=a.project_id,
            type=a.type,
            original_name=a.original_name,
            storage_path=a.storage_path,
            duration=a.duration,
            width=a.width,
            height=a.height,
            order_index=a.order_index,
            url=f"/storage/{rel_path}"
        ))
    assets_res.sort(key=lambda x: x.order_index)

    sentences_res = [
        SentenceItem(
            id=s.id,
            order_index=s.order_index,
            text=s.text,
            start_time=s.start_time,
            end_time=s.end_time,
            confidence=s.confidence
        )
        for s in project.sentences
    ]
    sentences_res.sort(key=lambda x: x.order_index)

    timeline_data = None
    if project.timeline:
        try:
            timeline_data = TimelineData(**json.loads(project.timeline.timeline_json))
        except Exception:
            pass

    return ProjectDetail(
        id=project.id,
        name=project.name,
        created_at=project.created_at.isoformat() if project.created_at else "",
        updated_at=project.updated_at.isoformat() if project.updated_at else "",
        settings=settings,
        script=project.script,
        assets=assets_res,
        sentences=sentences_res,
        timeline=timeline_data
    )
