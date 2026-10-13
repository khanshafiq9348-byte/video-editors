# TIMELINE SYNCHRONIZATION AUDIT REPORT

## 1. Overview & Objective
This audit examines and validates the dynamic synchronization between uploaded visuals (images/video clips) and spoken voiceover sentences in AutoVideo Studio. Visual durations must strictly reflect actual speech alignment timestamps rather than fixed, arbitrary, or fabricated lengths.

---

## 2. Root Cause of Previous Synchronization Defects
1. **Dropped Visuals & Skipping**:
   - The legacy generator previously looped solely over spoken sentences: `for idx in range(num_sentences): img_id = image_ids[idx % num_images]`.
   - When more images than sentences were uploaded, trailing images were completely omitted from the timeline.
   - When fewer images than sentences were uploaded, images repeated abruptly with inconsistent pacing.
2. **Missing `endFrame` in Scene Data Contract**:
   - Scene schemas only tracked `startFrame` and `durationFrames`. Downstream Remotion renderers and export validation lacked canonical end boundary enforcement.
3. **Transition Timing Interference**:
   - Transitions previously applied fixed durations without checking whether the remaining scene length was sufficient, which caused visual pops, jump-cuts, and black frames.
4. **Aggressive Sentence Deduplication**:
   - Deduplication previously dropped valid speech sentences if their start times were within 0.15s, creating temporal drift between audio and visuals.

---

## 3. Implemented Fixes
1. **Dynamic Sentence Alignment & Proportional Distribution**:
   - In `backend/app/services/timeline_generator.py`, each spoken sentence span is extracted directly from high-precision speech recognition (Vosk / WhisperX / VAD timestamps).
   - If `num_images > num_sentences`, images are allocated proportionally to the spoken duration of each sentence so all visuals are preserved in order, with visual cuts strictly aligned to speech boundaries.
   - If `num_images <= num_sentences`, each scene maps directly to its assigned sentence:
     - `startFrame = Math.round(sentence.start_time * fps)`
     - `endFrame = Math.round(sentence.end_time * fps)`
     - `durationFrames = endFrame - startFrame`
2. **Canonical Scene Timing & Schema Sync**:
   - Added explicit `endFrame` to `SceneItem` in both backend schemas (`backend/app/schemas/__init__.py`) and frontend types (`frontend/src/types/timeline.ts`).
3. **Transition Rhythm Without Speech Shifts**:
   - Dynamic transition duration clamping: `max(6, min(trans_dur_frames, scene_duration // 3))` prevents transitions from exceeding scene boundaries.
4. **Export Engine Parity**:
   - `backend/app/services/fast_render_engine.py` reads canonical frame durations directly from the timeline data without recalculating or altering timings.

---

## 4. End-to-End Verification Test Results
Tested using actual voiceover audio (`test_out.wav`, 12.0s duration) with 5 uploaded images:

### Spoken Sentence Timestamps Detected:
- **Sentence 1** (`sent_001`): `0.09s - 2.16s` ("Welcome to the automatic video editor.")
- **Sentence 2** (`sent_002`): `2.97s - 6.51s` ("In this scene we explore beautiful landscapes and dramatic mountains.")
- **Sentence 3** (`sent_003`): `7.38s - 11.31s` ("Finally we conclude our journey with breathtaking views across the sunset.")

### Generated Timeline Scenes:
| Scene ID | Image ID | Sentence ID | Start Frame | Dur (Frames) | End Frame | Transition | Motion Effect |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `scene_001` | `img_4a653d78` | `sent_001` | 0 | 89 (~2.97s) | 89 | `crossfade` | `zoom_in` |
| `scene_002` | `img_d2f19d9a` | `sent_002` | 89 | 66 (~2.20s) | 155 | `slide_left` | `pan_left` |
| `scene_003` | `img_79427e66` | `sent_002` | 155 | 66 (~2.20s) | 221 | `crossfade` | `zoom_out` |
| `scene_004` | `img_419d1366` | `sent_003` | 221 | 70 (~2.33s) | 291 | `zoom` | `pan_right` |
| `scene_005` | `img_d51bd528` | `sent_003` | 291 | 70 (~2.33s) | 361 | None | `zoom_in` |

- **Verification**: Zero gaps between scenes, zero timing drift, seamless transition coverage, and full MP4 render verified at `1280x720@30fps`, 12.03s duration (8.04 MB).
