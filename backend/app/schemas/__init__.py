from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field

class ProjectSettings(BaseModel):
    width: int = 1920
    height: int = 1080
    aspect_ratio: str = "16:9"  # 16:9, 9:16, 1:1
    fps: int = 30
    preset: str = "documentary"  # documentary, storytelling, dynamic_youtube, minimal
    alignment_mode: str = "sequential"  # sequential, manual
    effect_style: str = "automatic"
    transition_style: str = "crossfade"
    transition_duration_seconds: float = 0.4
    animation_intensity: str = "medium"  # low, medium, high
    fit_mode: str = "fill"  # fill, fit, blur_background
    color_tone: str = "original"  # original, warm, cool, cinematic
    project_mode: str = "single_language"  # single_language, multi_language
    primary_language: str = "en"
    available_languages: List[str] = ["en"]
    active_audio_id: Optional[str] = None

class ProjectCreate(BaseModel):
    name: str = "New Project"
    settings: Optional[ProjectSettings] = Field(default_factory=ProjectSettings)

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    settings: Optional[ProjectSettings] = None
    script: Optional[str] = None

class AssetResponse(BaseModel):
    id: str
    project_id: str
    type: str  # "image" | "video" | "audio"
    original_name: str
    storage_path: str
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    order_index: int
    url: str

class UploadBatchResponse(BaseModel):
    uploaded: List[AssetResponse]
    unsupported: List[Dict[str, str]] = []
    total_uploaded: int

class SentenceItem(BaseModel):
    id: str
    order_index: int
    text: str
    start_time: float
    end_time: float
    confidence: float = 1.0
    words: Optional[List[Dict[str, Any]]] = None

class SentenceUpdate(BaseModel):
    sentences: List[SentenceItem]

class SceneEffect(BaseModel):
    type: str = "zoom_in"  # zoom_in, zoom_out, pan_left, pan_right, pan_up, pan_down, zoom_pan, static
    intensity: float = 0.15
    startScale: Optional[float] = 1.0
    endScale: Optional[float] = 1.15
    startX: Optional[float] = 0.0
    endX: Optional[float] = 0.0
    startY: Optional[float] = 0.0
    endY: Optional[float] = 0.0

class SceneTransition(BaseModel):
    type: str = "crossfade"  # cut, fade, crossfade, slide_left, slide_right, zoom
    durationFrames: int = 12

class SceneItem(BaseModel):
    id: str
    imageAssetId: str
    sentenceId: Optional[str] = None
    startFrame: int
    durationFrames: int
    endFrame: Optional[int] = None
    effect: SceneEffect
    transitionOut: Optional[SceneTransition] = None
    fitMode: Optional[str] = "fill"  # fill, fit, blur_background
    colorTone: Optional[str] = "original"  # original, warm, cool, cinematic

class TimelineAudio(BaseModel):
    assetId: str
    startFrame: int = 0
    durationFrames: Optional[int] = None

from app.schemas.captions import (
    CaptionWord,
    CaptionStyle,
    CaptionPreset,
    CaptionSegment,
    CaptionSettings,
    TimelineCaptions,
    CaptionGenerateRequest,
)

class TimelineData(BaseModel):
    projectId: str
    settings: ProjectSettings
    audio: Optional[TimelineAudio] = None
    scenes: List[SceneItem] = Field(default_factory=list)
    totalDurationFrames: int = 0
    captions: Optional[TimelineCaptions] = None

    class Config:
        populate_by_name = True
        extra = "allow"

class ProjectDetail(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    settings: ProjectSettings
    script: Optional[str] = None
    assets: List[AssetResponse] = Field(default_factory=list)
    sentences: List[SentenceItem] = Field(default_factory=list)
    timeline: Optional[TimelineData] = None

class RenderRequest(BaseModel):
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[int] = None
    quality: Optional[str] = "high"
    aspect_ratio: Optional[str] = None
    burn_captions: Optional[bool] = None

class RenderJobResponse(BaseModel):
    id: str
    project_id: str
    project_name: Optional[str] = None
    status: str
    progress: float
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    download_url: Optional[str] = None
    queue_position: Optional[int] = None
