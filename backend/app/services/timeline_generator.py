import uuid
import re
from typing import List, Dict, Any, Optional, Tuple
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

def select_effect_for_scene(
    index: int,
    duration_frames: int,
    preset: str,
    intensity: str,
    user_effect_style: Optional[str] = None
) -> SceneEffect:
    style = (user_effect_style or "").strip().lower()

    # If user selected an explicit effect (e.g. pan_left, zoom_out, static, etc.)
    if style in ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down", "zoom_pan", "static"]:
        eff_type = style
    elif preset == "minimal" or duration_frames < 30:
        eff_type = "static"
    elif preset == "documentary":
        # Curated documentary motion cycle with diverse pan & subtle zoom variations
        effs = ["pan_left", "zoom_out", "pan_right", "zoom_in", "pan_up", "zoom_pan"]
        eff_type = effs[index % len(effs)]
    elif preset == "storytelling":
        # Narrative style with gentle pans and balanced zoom transitions
        effs = ["pan_right", "zoom_out", "pan_left", "zoom_pan", "pan_down", "zoom_in"]
        eff_type = effs[index % len(effs)]
    elif preset == "dynamic_youtube":
        effs = ["pan_left", "zoom_pan", "pan_right", "zoom_out", "pan_up", "zoom_in"]
        eff_type = effs[index % len(effs)]
    else:
        # Default: Varied Ken Burns sequence preventing consecutive identical motions
        effs = ["pan_left", "zoom_out", "pan_right", "zoom_in", "pan_up", "zoom_pan"]
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

def split_sentence_into_subsegments(
    sentence: Dict[str, Any],
    count: int,
    start_sec: float,
    end_sec: float
) -> List[Tuple[float, float]]:
    """
    Splits a sentence's time span [start_sec, end_sec] into `count` meaningful sub-segments
    based on exact word-level timestamps (word pauses, punctuation, clause connectors).
    Guarantees strictly monotonically increasing timestamps with zero gaps.
    """
    if count <= 1:
        return [(start_sec, end_sec)]

    words = sentence.get("words") or []
    K = len(words)

    # 1. Word-level timestamp alignment
    if K >= count:
        cuts = []
        prev_idx = 0
        for m in range(1, count):
            ideal_time = start_sec + m * (end_sec - start_sec) / count
            best_cand = None
            best_score = -999999.0

            # Valid candidate cut word index: must leave enough words for remaining cuts
            for k in range(prev_idx, K - (count - m)):
                w = words[k]
                w_next = words[k + 1]
                t_cut = float(w_next["start"])

                score = 0.0
                pause = float(w_next["start"]) - float(w["end"])
                if pause >= 0.04:
                    score += min(3.5, pause * 5.0)

                w_text = w.get("word", "")
                if any(w_text.endswith(p) for p in [",", ";", ":", "-", "--"]):
                    score += 2.5
                elif any(w_text.endswith(p) for p in [".", "!", "?"]):
                    score += 3.0

                w_next_clean = w_next.get("word", "").lower().strip(".,;:?!\"'")
                clause_markers = {
                    "and", "but", "or", "while", "where", "which", "because",
                    "although", "since", "with", "when", "that", "so", "as", "then", "yet"
                }
                prepositions = {
                    "in", "on", "at", "through", "across", "into", "from", "to", "by", "for", "about"
                }
                if w_next_clean in clause_markers:
                    score += 2.0
                elif w_next_clean in prepositions:
                    score += 0.8

                # Timing distance penalty
                dist = abs(t_cut - ideal_time)
                score -= dist * 0.5

                if score > best_score:
                    best_score = score
                    best_cand = (k, t_cut)

            if best_cand:
                prev_idx = best_cand[0] + 1
                cuts.append(best_cand[1])
            else:
                cuts.append(ideal_time)

        cuts = sorted(cuts)
        # Ensure cuts are strictly within (start_sec, end_sec)
        clean_cuts = []
        last_t = start_sec
        min_gap = 0.3
        for c in cuts:
            c_val = max(last_t + min_gap, min(end_sec - min_gap, c))
            clean_cuts.append(round(c_val, 3))
            last_t = c_val

        times = [start_sec] + clean_cuts + [end_sec]
        return [(times[i], times[i + 1]) for i in range(count)]

    # 2. Text clause fallback if word timestamps not available
    text = (sentence.get("text") or "").strip()
    clauses = [c.strip() for c in re.split(r'[,;:]|\b(?:and|but|while|where|with)\b', text) if c.strip()]
    if len(clauses) >= count:
        clause_lens = [max(1, len(c)) for c in clauses[:count]]
        total_len = sum(clause_lens)
        times = [start_sec]
        curr = start_sec
        span_dur = end_sec - start_sec
        for l in clause_lens[:-1]:
            curr += span_dur * (l / total_len)
            times.append(round(curr, 3))
        times.append(end_sec)
        return [(times[i], times[i + 1]) for i in range(count)]

    # 3. Uniform proportional fallback
    step = (end_sec - start_sec) / count
    return [(round(start_sec + i * step, 3), round(start_sec + (i + 1) * step, 3)) for i in range(count)]

def get_sent_start(s: Dict[str, Any]) -> float:
    if "start_time" in s and s["start_time"] is not None:
        return float(s["start_time"])
    return float(s.get("start", 0.0))

def get_sent_end(s: Dict[str, Any]) -> float:
    if "end_time" in s and s["end_time"] is not None:
        return float(s["end_time"])
    return float(s.get("end", 0.0))

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
        raw_sorted = sorted(sentences, key=lambda s: (get_sent_start(s), int(s.get("order_index", 0))))

        # Deduplicate sentences: remove duplicate sentences with near-identical start times (< 0.10s)
        sorted_sentences = []
        for s in raw_sorted:
            txt = (s.get("text") or "").strip()
            if not txt:
                continue
            s_start = get_sent_start(s)
            if sorted_sentences:
                prev = sorted_sentences[-1]
                prev_start = get_sent_start(prev)
                prev_txt = (prev.get("text") or "").strip()
                if abs(s_start - prev_start) < 0.10 and (prev_txt.lower() == txt.lower() or abs(get_sent_end(s) - get_sent_end(prev)) < 0.10):
                    if get_sent_end(s) > get_sent_end(prev):
                        sorted_sentences[-1] = s
                    continue
            sorted_sentences.append(s)

        num_sentences = len(sorted_sentences)

        if num_sentences > 0:
            total_end_sec = max(
                get_sent_end(sorted_sentences[-1]),
                (total_audio_duration or 0.0)
            )

            # CASE A: num_images <= num_sentences
            # Every sentence corresponds directly to a visual scene.
            # Visuals change exactly when each sentence begins.
            if num_images <= num_sentences:
                for i, sent in enumerate(sorted_sentences):
                    img_id = image_ids[i % num_images]
                    start_sec = get_sent_start(sent)
                    end_sec = get_sent_end(sent)

                    # 1. Start frame: First scene starts at 00:00 (frame 0)
                    if i == 0:
                        scene_start = 0
                    else:
                        scene_start = int(round(start_sec * fps))

                    # 2. Visual changes exactly when the next sentence begins
                    if i < num_sentences - 1:
                        next_start_sec = get_sent_start(sorted_sentences[i + 1])
                        next_start_frame = int(round(next_start_sec * fps))
                        scene_end = max(scene_start + int(fps * 0.5), next_start_frame)
                    else:
                        if total_audio_duration and total_audio_duration > 0:
                            total_audio_frames = int(round(total_audio_duration * fps))
                            scene_end = max(int(round(end_sec * fps)), total_audio_frames)
                        else:
                            scene_end = int(round(end_sec * fps))

                    scene_duration = max(int(fps * 0.5), scene_end - scene_start)

                    eff = select_effect_for_scene(
                        i,
                        scene_duration,
                        preset,
                        intensity,
                        settings.effect_style
                    )
                    dynamic_trans_frames = max(6, min(trans_dur_frames, scene_duration // 3))
                    trans = select_transition_for_scene(
                        i,
                        num_sentences,
                        dynamic_trans_frames,
                        settings.transition_style,
                        preset
                    )

                    scene_id = f"scene_{i + 1:03d}_{uuid.uuid4().hex[:6]}"
                    scenes.append(SceneItem(
                        id=scene_id,
                        imageAssetId=img_id,
                        sentenceId=sent.get("id"),
                        startFrame=scene_start,
                        endFrame=scene_end,
                        durationFrames=scene_duration,
                        effect=eff,
                        transitionOut=trans,
                        fitMode=getattr(settings, "fit_mode", "fill"),
                        colorTone=getattr(settings, "color_tone", "original")
                    ))

            # CASE B: num_images > num_sentences
            # More images than sentences: split longer sentences into speech-accurate phrase segments
            # using word-level pauses, punctuation, and clause timestamps.
            else:
                durations = [
                    max(0.1, get_sent_end(s) - get_sent_start(s))
                    for s in sorted_sentences
                ]
                counts = [1] * num_sentences
                rem = num_images - num_sentences
                while rem > 0:
                    idx = max(range(num_sentences), key=lambda k: durations[k] / counts[k])
                    counts[idx] += 1
                    rem -= 1

                raw_scene_specs = []
                curr_img_idx = 0
                for j in range(num_sentences):
                    st = 0.0 if j == 0 else get_sent_start(sorted_sentences[j])
                    et = get_sent_start(sorted_sentences[j + 1]) if j < num_sentences - 1 else total_end_sec
                    sub_spans = split_sentence_into_subsegments(sorted_sentences[j], counts[j], st, et)
                    for sub_st, sub_et in sub_spans:
                        raw_scene_specs.append({
                            "image_id": image_ids[curr_img_idx],
                            "sentence_id": sorted_sentences[j].get("id"),
                            "start_sec": sub_st,
                            "end_sec": sub_et
                        })
                        curr_img_idx += 1

                curr_frame = 0
                total_expected_scenes = len(raw_scene_specs)
                for idx, spec in enumerate(raw_scene_specs):
                    scene_start = curr_frame
                    target_end = int(round(spec["end_sec"] * fps))
                    if idx == total_expected_scenes - 1:
                        if total_audio_duration and total_audio_duration > 0:
                            target_end = max(target_end, int(round(total_audio_duration * fps)))
                        scene_end = max(scene_start + int(fps * 0.5), target_end)
                    else:
                        scene_end = max(scene_start + int(fps * 0.5), target_end)

                    scene_duration = scene_end - scene_start
                    curr_frame = scene_end

                    eff = select_effect_for_scene(
                        idx,
                        scene_duration,
                        preset,
                        intensity,
                        settings.effect_style
                    )
                    dynamic_trans_frames = max(6, min(trans_dur_frames, scene_duration // 3))
                    trans = select_transition_for_scene(
                        idx,
                        total_expected_scenes,
                        dynamic_trans_frames,
                        settings.transition_style,
                        preset
                    )

                    scene_id = f"scene_{idx + 1:03d}_{uuid.uuid4().hex[:6]}"
                    scenes.append(SceneItem(
                        id=scene_id,
                        imageAssetId=spec["image_id"],
                        sentenceId=spec["sentence_id"],
                        startFrame=scene_start,
                        endFrame=scene_end,
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
            eff = select_effect_for_scene(
                i,
                scene_duration,
                preset,
                intensity,
                settings.effect_style
            )
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

            eff = select_effect_for_scene(
                i,
                scene_duration,
                preset,
                intensity,
                settings.effect_style
            )
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
