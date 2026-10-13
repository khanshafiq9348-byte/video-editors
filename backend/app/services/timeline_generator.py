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

# Advanced transition sequence anchored by smooth crossfades for professional cinema rhythm
CURATED_TRANSITIONS = [
    "crossfade",
    "slide_left",
    "crossfade",
    "zoom",
    "crossfade",
    "slide_right",
    "crossfade",
    "fade"
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

def select_transition_for_scene(
    index: int,
    total_scenes: int,
    trans_dur_frames: int,
    user_style: Optional[str] = None,
    preset: Optional[str] = None
) -> Optional[SceneTransition]:
    """
    Selects clean, professional transitions avoiding unintentional repetition.
    - Uses smooth, professional crossfade as default anchor.
    - If varied / dynamic / cinematic style or preset is chosen, rotates through curated styles without consecutive repetition.
    - If user specifies an explicit transition (crossfade, fade, slide_left, slide_right, zoom, cut), honors it cleanly.
    """
    if index >= total_scenes - 1:
        return None  # Last scene needs no transition out

    style = (user_style or "").strip().lower()

    if style == "cut":
        return SceneTransition(type="cut", durationFrames=0)

    # Explicit user choices
    if style in ["crossfade", "fade", "slide_left", "slide_right", "zoom"]:
        return SceneTransition(type=style, durationFrames=trans_dur_frames)

    # Varied / dynamic / cinematic styles: rotate smartly without repeating the same effect
    if style in ["varied", "cinematic", "dynamic"] or preset in ["dynamic_youtube", "storytelling"]:
        trans_type = CURATED_TRANSITIONS[index % len(CURATED_TRANSITIONS)]
        return SceneTransition(type=trans_type, durationFrames=trans_dur_frames)

    # Default: Smooth, professional crossfade
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

        # Clean deduplication: only drop true exact duplicates (identical text + identical start time)
        sorted_sentences = []
        for s in raw_sorted:
            txt = (s.get("text") or "").strip()
            if not txt:
                continue
            s_start = float(s.get("start_time", 0.0))
            if sorted_sentences:
                prev = sorted_sentences[-1]
                prev_start = float(prev.get("start_time", 0.0))
                prev_txt = (prev.get("text") or "").strip()
                if abs(s_start - prev_start) < 0.05 and prev_txt.lower() == txt.lower():
                    continue
            sorted_sentences.append(s)

        num_sentences = len(sorted_sentences)

        if num_sentences > 0:
            # Build contiguous sentence frame spans: each sentence covers from its start
            # until the next sentence starts, ensuring zero gaps, zero black frames, and exact sync
            sent_spans = []
            for i in range(num_sentences):
                # Scene 1 begins at frame 0 so visual covers audio from the very start
                st_sec = 0.0 if i == 0 else float(sorted_sentences[i].get("start_time", 0.0))
                if i < num_sentences - 1:
                    et_sec = float(sorted_sentences[i + 1].get("start_time", 0.0))
                else:
                    if total_audio_duration and total_audio_duration > 0:
                        et_sec = max(float(sorted_sentences[i].get("end_time", 0.0)), total_audio_duration)
                    else:
                        et_sec = float(sorted_sentences[i].get("end_time", 0.0))

                start_frame = int(round(st_sec * fps))
                end_frame = max(start_frame + 15, int(round(et_sec * fps)))
                sent_spans.append((start_frame, end_frame))

            # Distribute images across sentences so ALL uploaded images are utilized in order
            if num_images > num_sentences:
                # Proportional image counts per sentence based on spoken duration
                weights = [max(1, span[1] - span[0]) for span in sent_spans]
                total_w = sum(weights)
                counts = [max(1, int(round(w / total_w * num_images))) for w in weights]
                while sum(counts) > num_images:
                    max_idx = counts.index(max(counts))
                    counts[max_idx] -= 1
                while sum(counts) < num_images:
                    min_idx = counts.index(min(counts))
                    counts[min_idx] += 1
            else:
                counts = [1] * num_sentences

            # Build contiguous scenes
            curr_img_idx = 0
            scene_counter = 0

            # Calculate total scenes to be created
            total_expected_scenes = sum(counts) if num_images > num_sentences else num_sentences

            for s_idx in range(num_sentences):
                span_start, span_end = sent_spans[s_idx]
                span_dur = max(15, span_end - span_start)
                num_sub_scenes = counts[s_idx]
                sub_dur = span_dur // num_sub_scenes

                for sub in range(num_sub_scenes):
                    if num_images > num_sentences:
                        img_id = image_ids[curr_img_idx]
                        curr_img_idx += 1
                    else:
                        img_id = image_ids[s_idx % num_images]

                    scene_start = span_start + sub * sub_dur
                    scene_duration = (span_end - scene_start) if sub == num_sub_scenes - 1 else sub_dur
                    scene_end = scene_start + scene_duration

                    eff = select_effect_for_scene(scene_counter, scene_duration, preset, intensity)
                    dynamic_trans_frames = max(6, min(trans_dur_frames, scene_duration // 3))
                    trans = select_transition_for_scene(
                        scene_counter,
                        total_expected_scenes,
                        dynamic_trans_frames,
                        settings.transition_style,
                        preset
                    )

                    scene_id = f"scene_{scene_counter + 1:03d}_{uuid.uuid4().hex[:6]}"
                    scenes.append(SceneItem(
                        id=scene_id,
                        imageAssetId=img_id,
                        sentenceId=sorted_sentences[s_idx].get("id"),
                        startFrame=scene_start,
                        endFrame=scene_end,
                        durationFrames=scene_duration,
                        effect=eff,
                        transitionOut=trans,
                        fitMode=getattr(settings, "fit_mode", "fill"),
                        colorTone=getattr(settings, "color_tone", "original")
                    ))
                    scene_counter += 1

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
            dynamic_trans_frames = max(6, min(trans_dur_frames, scene_duration // 3))
            trans = select_transition_for_scene(
                i,
                num_images,
                dynamic_trans_frames,
                settings.transition_style,
                preset
            )

            scene_id = f"scene_{i+1:03d}_{uuid.uuid4().hex[:6]}"
            scenes.append(SceneItem(
                id=scene_id,
                imageAssetId=img_id,
                sentenceId=None,
                startFrame=scene_start,
                endFrame=scene_start + scene_duration,
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
            dynamic_trans_frames = max(6, min(trans_dur_frames, scene_duration // 3))
            trans = select_transition_for_scene(
                i,
                num_images,
                dynamic_trans_frames,
                settings.transition_style,
                preset
            )

            scene_id = f"scene_{i+1:03d}_{uuid.uuid4().hex[:6]}"
            scenes.append(SceneItem(
                id=scene_id,
                imageAssetId=img_id,
                sentenceId=None,
                startFrame=scene_start,
                endFrame=scene_start + scene_duration,
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
