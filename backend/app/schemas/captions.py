from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field

class CaptionWord(BaseModel):
    id: str
    text: str
    start_frame: int = Field(alias="startFrame")
    end_frame: int = Field(alias="endFrame")
    start_time: Optional[float] = Field(default=None, alias="startTime")
    end_time: Optional[float] = Field(default=None, alias="endTime")
    confidence: Optional[float] = 1.0

    class Config:
        populate_by_name = True
        extra = "allow"
        allow_population_by_field_name = True

class CaptionStyle(BaseModel):
    font_family: str = Field(default="Inter", alias="fontFamily")
    font_size: int = Field(default=48, alias="fontSize")
    font_weight: int = Field(default=700, alias="fontWeight")
    italic: bool = False
    uppercase: bool = False

    text_color: str = Field(default="#FFFFFF", alias="textColor")
    highlight_color: str = Field(default="#FFDF00", alias="highlightColor")

    background_enabled: bool = Field(default=False, alias="backgroundEnabled")
    background_color: str = Field(default="#000000", alias="backgroundColor")
    background_opacity: float = Field(default=0.6, alias="backgroundOpacity")
    background_padding: int = Field(default=12, alias="backgroundPadding")
    background_radius: int = Field(default=8, alias="backgroundRadius")

    stroke_enabled: bool = Field(default=True, alias="strokeEnabled")
    stroke_color: str = Field(default="#000000", alias="strokeColor")
    stroke_width: int = Field(default=3, alias="strokeWidth")

    shadow_enabled: bool = Field(default=True, alias="shadowEnabled")
    shadow_color: str = Field(default="rgba(0, 0, 0, 0.75)", alias="shadowColor")
    shadow_blur: int = Field(default=6, alias="shadowBlur")
    shadow_offset_x: int = Field(default=0, alias="shadowOffsetX")
    shadow_offset_y: int = Field(default=3, alias="shadowOffsetY")

    letter_spacing: float = Field(default=0.0, alias="letterSpacing")
    line_height: float = Field(default=1.2, alias="lineHeight")

    text_align: Literal["left", "center", "right"] = Field(default="center", alias="textAlign")

    position_x: float = Field(default=50.0, alias="positionX")
    position_y: float = Field(default=82.0, alias="positionY")

    animation_type: str = Field(default="none", alias="animationType")
    animation_intensity: float = Field(default=1.0, alias="animationIntensity")

    class Config:
        populate_by_name = True
        extra = "allow"

class CaptionPreset(BaseModel):
    id: str
    name: str
    category: Literal["all", "classic", "youtube", "karaoke", "cinematic", "animated", "minimal"] = "all"
    mode: Literal["classic", "word_by_word", "karaoke", "word_pop", "phrase"] = "karaoke"
    style: CaptionStyle
    is_custom: bool = Field(default=False, alias="isCustom")

    class Config:
        populate_by_name = True
        extra = "allow"

class CaptionSegment(BaseModel):
    id: str
    text: str
    start_frame: int = Field(alias="startFrame")
    end_frame: int = Field(alias="endFrame")
    start_time: Optional[float] = Field(default=None, alias="startTime")
    end_time: Optional[float] = Field(default=None, alias="endTime")
    words: List[CaptionWord] = []
    style_override: Optional[Dict[str, Any]] = Field(default=None, alias="styleOverride")

    class Config:
        populate_by_name = True
        extra = "allow"

class CaptionSettings(BaseModel):
    enabled: bool = True
    mode: Literal["classic", "word_by_word", "karaoke", "word_pop", "phrase"] = "karaoke"
    selected_preset_id: str = Field(default="preset_yellow_karaoke", alias="selectedPresetId")
    global_style: CaptionStyle = Field(default_factory=CaptionStyle, alias="globalStyle")
    custom_presets: List[CaptionPreset] = Field(default_factory=list, alias="customPresets")

    class Config:
        populate_by_name = True
        extra = "allow"

class TimelineCaptions(BaseModel):
    settings: CaptionSettings = Field(default_factory=CaptionSettings)
    segments: List[CaptionSegment] = Field(default_factory=list)

    class Config:
        populate_by_name = True
        extra = "allow"

class CaptionGenerateRequest(BaseModel):
    preset_id: Optional[str] = Field(default="preset_yellow_karaoke", alias="presetId")
    mode: Optional[Literal["classic", "word_by_word", "karaoke", "word_pop", "phrase"]] = "karaoke"
    words_per_segment: Optional[int] = Field(default=5, alias="wordsPerSegment")

    class Config:
        populate_by_name = True
        extra = "allow"
