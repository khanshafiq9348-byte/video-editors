# AutoVideo Studio 🎬
## AI-Powered Automated Video Editor

**AutoVideo Studio** is a local-first web application designed to automatically generate professional storytelling and documentary videos from static images and voiceover audio.

---

## 🌟 Key Features

1. **Automatic Voiceover Analysis**
   - Transcribes speech and detects sentence boundaries with timestamps.
   - Word and sentence level synchronization with graceful VAD/silence-detection fallback.
   - Optional script forced alignment for 100% transcript precision.

2. **Smart Image Alignment**
   - Sequential, rhythmic, and sentence-matched image distribution.
   - Handles image count mismatches (repeats or reserves assets).

3. **Ken Burns Motion Engine**
   - Automated cinematic zoom and pan animations (Zoom In, Zoom Out, Pan Left/Right/Up/Down, Zoom+Pan, Static).
   - High precision frame-based easing with no black border clipping.

4. **Seamless Transitions**
   - Cross Dissolve, Fade to Black, Slide Left/Right, Zoom transitions.
   - Overlap protection preventing audio/video desynchronization.

5. **Interactive Multitrack Timeline Editor**
   - Visual clip tracks, audio waveforms, and sentence marker bands.
   - Real-time dragging, splitting (Scissors tool), resizing, asset replacement, and scene deletion.
   - Full Undo / Redo history stack.

6. **Real-time Remotion Preview Player**
   - Instant video playback, seeking, frame stepping, and timestamp sync.

7. **MP4 Video Export**
   - High quality H.264 / AAC MP4 video rendering powered by Remotion and FFmpeg.
   - Background job processing with real-time percentage progress and instant file download.

---

## 🛠️ Technology Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Zustand, Remotion Player, Lucide React
- **Backend:** Python 3.11+, FastAPI, Uvicorn, SQLite, SQLAlchemy, Pydantic
- **Audio & Media:** FFmpeg, SoundFile, NumPy, Whisper/faster-whisper
- **Video Rendering:** Remotion, Headless Chromium, FFmpeg

---

## 🚀 Getting Started

### 1. Prerequisites
- **Python 3.11+** installed
- **Node.js 18+** & **npm** installed
- **FFmpeg** installed and accessible in system PATH (`ffmpeg -version`)

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API Documentation will be live at: `http://127.0.0.1:8000/docs`

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open your browser at: `http://localhost:5173`

### 4. Remotion Renderer Setup
```bash
cd remotion
npm install
```

---

## 💻 Workflow / How to Use

1. **Open AutoVideo Studio** in your browser.
2. Click **New Project** and enter a title.
3. In the left panel, click **Upload Images** and choose your photos or illustrations.
4. Click **Upload Voiceover** and choose your MP3/WAV voiceover file.
5. (Optional) Paste your script into the Script field.
6. Click **Analyze Voiceover** to extract sentence timestamps.
7. Click **Auto Generate Video** — the system aligns the images, applies Ken Burns motion, and generates the timeline.
8. Preview your video in the central player.
9. Click any clip to customize its Ken Burns effect, transition, or duration in the right panel.
10. Click **Export MP4** to render and download your final video!

---

## 🧪 Testing

Run backend tests:
```bash
pytest backend/tests/test_core.py -v
```

Run end-to-end smoke test:
```bash
python scripts/test_e2e.py
```
