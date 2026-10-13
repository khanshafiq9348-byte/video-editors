import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base, STORAGE_DIR
from app.api import projects, uploads, transcription, rendering, captions

# Initialize DB tables
Base.metadata.create_all(bind=engine)
try:
    with engine.connect() as _conn:
        _cursor = _conn.connection.cursor()
        _cursor.execute("PRAGMA table_info(sentences)")
        _cols = [row[1] for row in _cursor.fetchall()]
        if "words_json" not in _cols:
            _cursor.execute("ALTER TABLE sentences ADD COLUMN words_json TEXT DEFAULT '[]'")
            _conn.connection.commit()
except Exception as _e:
    print(f"[DB Init] Notice: {_e}")

app = FastAPI(
    title="AutoVideo Studio API",
    description="Backend API for AI Automated Video Editor",
    version="1.0.1"
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount local storage folder for serving media assets (images, audio, previews)
os.makedirs(STORAGE_DIR, exist_ok=True)
app.mount("/storage", StaticFiles(directory=STORAGE_DIR), name="storage")

# Include Routers
app.include_router(projects.router)
app.include_router(uploads.router)
app.include_router(transcription.router)
app.include_router(rendering.router)
app.include_router(captions.router)

@app.get("/api/health")
def health_check():
    from app.services.audio_analyzer import check_ffmpeg
    ffmpeg_ok = check_ffmpeg()
    return {
        "status": "healthy",
        "ffmpeg_available": ffmpeg_ok,
        "storage_dir": STORAGE_DIR
    }
