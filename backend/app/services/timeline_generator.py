import uuid
from typing import List, Dict, Any, Optional
from app.schemas import ProjectSettings, TimelineData, SceneItem, SceneEffect, SceneTransition, TimelineAudio

# Available animation effects
EFFECT_TYPES = [
    "zoom_in",
    "zoom_out",
    "pan_left",
    "pan_right",
    "pan_up",
    "pan_down",
    "zoom_pan"
]

# Advanced transition rotation sequence for cinema grade edit rhythm
CINEMATIC_TRANSITIONS = [
    "crossfade",
    "slide_left",
    "zoom",
    "crossfade",
    "slide_right",
    "fade",
    "zoom",
    "crossfade"
]

def get_effect_parameters(effect_type: str, intensity: str = "medium") -> Dict[str, float]:
    """Calculate deterministic Ken Burns parameters based on intensity."""
    intensity_mult = {
        "low": 0.08,
        "medium": 0.15,
        "high": 0.25
    }.get(intensity, 0.15)

    if effect_type == "zoom_in":
        return {
            "startScale": 1.0,
            "endScale": round(1.0 + intensity_mult, 3),
            "startX": 0.0, "endX": 0.0,
            "startY": 0.0, "endY": 0.0
        }
    elif effect_type == "zoom_out":
        return {
            "startScale": round(1.0 + intensity_mult, 3),
            "endScale": 1.0,
            "startX": 0.0, "endX": 0.0,
            "startY": 0.0, "endY": 0.0
        }
    elif effect_type == "pan_left":
        shift = round(intensity_mult * 100, 1)
        return {
            "startScale": round(1.0 + intensity_mult * 0.5, 3),
            "endScale": round(1.0 + intensity_mult * 0.5, 3),
            "startX": shift, "endX": -shift,
            "startY": 0.0, "endY": 0.0
        }
    elif effect_type == "pan_right":
        shift = round(intensity_mult * 100, 1)
        return {
            "startScale": round(1.0 + intensity_mult * 0.5, 3),
            "endScale": round(1.0 + intensity_mult * 0.5, 3),
            "startX": -shift, "endX": shift,
            "startY": 0.0, "endY": 0.0
        }
    elif effect_type == "pan_up":
        shift = round(intensity_mult * 80, 1)
        return {
            "startScale": round(1.0 + intensity_mult * 0.5, 3),
            "endScale": round(1.0 + intensity_mult * 0.5, 3),
            "startX": 0.0, "endX": 0.0,
            "startY": shift, "endY": -shift
        }
    elif effect_type == "pan_down":
        shift = round(intensity_mult * 80, 1)
        return {
            "startScale": round(1.0 + intensity_mult * 0.5, 3),
            "endScale": round(1.0 + intensity_mult * 0.5, 3),
            "startX": 0.0, "endX": 0.0,
            "startY": -shift, "endY": shift
        }
    elif effect_type == "zoom_pan":
        shift = round(intensity_mult * 60, 1)
        return {
            "startScale": 1.0,
            "endScale": round(1.0 + intensity_mult, 3),
            "startX": -shift, "endX": shift,
            "startY": 0.0, "endY": -shift * 0.5
        }
    else:  # static
        return {
            "startScale": 1.0, "endScale": 1.0,
            "startX": 0.0, "endX": 0.0,
            "startY": 0.0, "endY": 0.0
        }

def select_effect_for_scene(index: int, duration_frames: int, preset: str, intensity: str) -> SceneEffect:
    if preset == "minimal" or duration_frames < 30:
        eff_type = "static"
    elif preset == "documentary":
        effs = ["zoom_in", "pan_left", "zoom_out", "pan_right"]
        eff_type = effs[index % len(effs)]
    elif preset == "storytelling":
        effs = ["zoom_in", "zoom_out", "zoom_pan", "pan_right"]
        eff_type = effs[index % len(effs)]
    elif preset == "dynamic_youtube":
        effs = ["zoom_in", "zoom_pan", "pan_left", "zoom_out", "pan_right", "pan_up"]
        eff_type = effs[index % len(effs)]
    else:
        effs = EFFECT_TYPES
        eff_type = effs[index % len(effs)]

    params = get_effect_parameters(eff_type, intensity)
    return SceneEffect(
        type=eff_type,
        intensity=0.15 if intensity == "medium" else (0.08 if intensity == "low" else 0.25),
        **params
    )

def select_transition_for_scene(index: int, total_scenes: int, trans_dur_frames: int, user_style: Optional[str] = None) -> Optional[SceneTransition]:
    """Clean, professional crossfade transition selection."""
    if index >= total_scenes - 1:
        return None  # Last scene needs no out-transition
    
    # If user selected an explicit transition style other than auto/automatic, honor it
    if user_style and user_style not in ["automatic", "auto"]:
        return SceneTransition(type=user_style, durationFrames=trans_dur_frames)

    # Clean, professional crossfade is standard across all scenes
    return SceneTransition(type="crossfade", durationFrames=trans_dur_frames)

def generate_timeline(
    project_id: str,
    settings: ProjectSettings,
    image_ids: List[str],
    sentences: List[Dict[str, Any]],
    audio_asset_id: Optional[str] = None,
    total_audio_duration: Optional[float] = None
) -> TimelineData:
    fps = settings.fps or 30
    preset = settings.preset or "documentary"
    intensity = settings.animation_intensity or "medium"
    trans_dur_frames = max(6, int(round((settings.transition_duration_seconds or 0.4) * fps)))

    scenes: List[SceneItem] = []
    num_images = len(image_ids)
    if num_images == 0:
        return TimelineData(
            projectId=project_id,
            settings=settings,
            audio=None,
            scenes=[],
            totalDurationFrames=0
        )

    # CASE 1: Voiceover has analyzed spoken sentences with timestamps
    if sentences:
        raw_sorted = sorted(sentences, key=lambda s: (float(s.get("start_time", 0.0)), int(s.get("order_index", 0))))
        
        # Deduplicate sentences: remove duplicate sentences with identical start times or near-identical start times (< 0.15s)
        sorted_sentences = []
        for s in raw_sorted:
            s_start = float(s.get("start_time", 0.0))
            if sorted_sentences:
                prev_start = float(sorted_sentences[-1].get("start_time", 0.0))
                if abs(s_start - prev_start) < 0.15:
                    if float(s.get("end_time", 0.0)) > float(sorted_sentences[-1].get("end_time", 0.0)):
                        sorted_sentences[-1] = s
                    continue
            sorted_sentences.append(s)

        num_sentences = len(sorted_sentences)

        for i, sent in enumerate(sorted_sentences):
            img_id = image_ids[i % num_images]
            start_sec = float(sent.get("start_time", 0.0))
            end_sec = float(sent.get("end_time", start_sec))

            # 1. Start frame: First scene MUST start at 00:00 (frame 0) so the first image and speech start from the very beginning!
            if i == 0:
                scene_start = 0
            else:
                scene_start = int(round(start_sec * fps))

            # 2. Visual changes EXACTLY when the next sentence begins!
            if i < num_sentences - 1:
                next_start_sec = float(sorted_sentences[i + 1].get("start_time", end_sec))
                next_start_frame = int(round(next_start_sec * fps))
                scene_end = max(scene_start + int(fps * 0.5), next_start_frame)
            else:
                # Last scene extends to cover the full audio duration so visuals never end before voiceover
                if total_audio_duration:
                    total_audio_frames = int(round(total_audio_duration * fps))
                    scene_end = max(int(round(end_sec * fps)), total_audio_frames)
                else:
                    scene_end = int(round(end_sec * fps))

            scene_duration = max(int(fps * 0.5), scene_end - scene_start)

            # Effects and transitions adapt dynamically to each visual's actual duration
            eff = select_effect_for_scene(i, scene_duration, preset, intensity)
            dynamic_trans_frames = max(6, min(trans_dur_frames, scene_duration // 3))
            trans = select_transition_for_scene(
                i,
                num_sentences,
                dynamic_trans_frames,
                settings.transition_style
            )

            scene_id = f"scene_{i+1:03d}_{uuid.uuid4().hex[:6]}"
            scenes.append(SceneItem(
                id=scene_id,
                imageAssetId=img_id,
                sentenceId=sent.get("id"),
                startFrame=scene_start,
                durationFrames=scene_duration,
                effect=eff,
                transitionOut=trans,
                fitMode=getattr(settings, "fit_mode", "fill"),
                colorTone=getattr(settings, "color_tone", "original")
            ))

    # CASE 2: Audio exists without detected sentence timestamps (e.g. music/instrumental track)
    elif audio_asset_id and total_audio_duration and total_audio_duration > 0:
        total_audio_frames = int(round(total_audio_duration * fps))
        base_dur = max(15, total_audio_frames // num_images)
        curr_frame = 0

        for i, img_id in enumerate(image_ids):
            scene_start = curr_frame
            if i == num_images - 1:
                scene_duration = max(15, total_audio_frames - scene_start)
            else:
                scene_duration = base_dur

            curr_frame += scene_duration
            eff = select_effect_for_scene(i, scene_duration, preset, intensity)
            dynamic_trans_frames = max(1, min(trans_dur_frames, scene_duration // 2))
            trans = select_transition_for_scene(
                i,
                num_images,
                dynamic_trans_frames,
                settings.transition_style
            )

            scene_id = f"scene_{i+1:03d}_{uuid.uuid4().hex[:6]}"
            scenes.append(SceneItem(
                id=scene_id,
                imageAssetId=img_id,
                sentenceId=None,
                startFrame=scene_start,
                durationFrames=scene_duration,
                effect=eff,
                transitionOut=trans,
                fitMode=getattr(settings, "fit_mode", "fill"),
                colorTone=getattr(settings, "color_tone", "original")
            ))

    # CASE 3: No audio uploaded yet (visual sequence only)
    else:
        default_scene_dur = max(30, int(round(4.0 * fps)))
        curr_frame = 0

        for i, img_id in enumerate(image_ids):
            scene_start = curr_frame
            scene_duration = default_scene_dur
            curr_frame += scene_duration

            eff = select_effect_for_scene(i, scene_duration, preset, intensity)
            dynamic_trans_frames = max(1, min(trans_dur_frames, scene_duration // 2))
            trans = select_transition_for_scene(
                i,
                num_images,
                dynamic_trans_frames,
                settings.transition_style
            )

            scene_id = f"scene_{i+1:03d}_{uuid.uuid4().hex[:6]}"
            scenes.append(SceneItem(
                id=scene_id,
                imageAssetId=img_id,
                sentenceId=None,
                startFrame=scene_start,
                durationFrames=scene_duration,
                effect=eff,
                transitionOut=trans,
                fitMode=getattr(settings, "fit_mode", "fill"),
                colorTone=getattr(settings, "color_tone", "original")
            ))

    # Calculate total duration
    max_scene_end = max((s.startFrame + s.durationFrames for s in scenes), default=0)
    total_frames = max_scene_end

    audio_data = None
    if audio_asset_id:
        dur_frames = int(round((total_audio_duration or (total_frames / fps)) * fps))
        audio_data = TimelineAudio(
            assetId=audio_asset_id,
            startFrame=0,
            durationFrames=dur_frames
        )
        total_frames = max(total_frames, dur_frames)

    return TimelineData(
        projectId=project_id,
        settings=settings,
        audio=audio_data,
        scenes=scenes,
        totalDurationFrames=total_frames
    )
