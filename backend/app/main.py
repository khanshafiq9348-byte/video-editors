import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base, STORAGE_DIR
from app.api import projects, uploads, transcription, rendering, captions

# Initialize DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AutoVideo Studio API",
    description="Backend API for AI Automated Video Editor",
    version="1.0.0"
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
