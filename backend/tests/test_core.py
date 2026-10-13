import os
import sys
import pytest
from fastapi.testclient import TestClient

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.services.audio_analyzer import check_ffmpeg, get_media_metadata, generate_waveform_points
from app.services.timeline_generator import generate_timeline
from app.schemas import ProjectSettings

client = TestClient(app)

def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["ffmpeg_available"] is True

def test_project_crud():
    # 1. Create project
    create_res = client.post("/api/projects", json={"name": "Test Suite Project"})
    assert create_res.status_code == 200
    proj = create_res.json()
    proj_id = proj["id"]
    assert proj["name"] == "Test Suite Project"

    # 2. Get project
    get_res = client.get(f"/api/projects/{proj_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == proj_id

    # 3. Update project
    update_res = client.put(f"/api/projects/{proj_id}", json={"name": "Renamed Test Project"})
    assert update_res.status_code == 200
    assert update_res.json()["name"] == "Renamed Test Project"

    # 4. Clean up delete
    del_res = client.delete(f"/api/projects/{proj_id}")
    assert del_res.status_code == 200

def test_media_metadata():
    fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "test_fixtures"))
    audio_path = os.path.join(fixtures_dir, "test_voiceover.mp3")
    img_path = os.path.join(fixtures_dir, "test_img1.png")

    assert os.path.exists(audio_path)
    assert os.path.exists(img_path)

    audio_meta = get_media_metadata(audio_path)
    assert audio_meta["duration"] is not None
    assert audio_meta["duration"] > 5.0

    img_meta = get_media_metadata(img_path)
    assert img_meta["width"] == 1280
    assert img_meta["height"] == 720

    points = generate_waveform_points(audio_path, num_points=50)
    assert len(points) == 50

def test_timeline_generation():
    settings = ProjectSettings(fps=30, preset="documentary")
    image_ids = ["img_1", "img_2", "img_3"]
    sentences = [
        {"id": "s1", "text": "First sentence.", "start_time": 0.0, "end_time": 2.0},
        {"id": "s2", "text": "Second sentence.", "start_time": 2.0, "end_time": 4.0},
        {"id": "s3", "text": "Third sentence.", "start_time": 4.0, "end_time": 6.0},
    ]

    tl = generate_timeline(
        project_id="test_proj",
        settings=settings,
        image_ids=image_ids,
        sentences=sentences,
        audio_asset_id="aud_1",
        total_audio_duration=6.0
    )

    assert len(tl.scenes) == 3
    assert tl.totalDurationFrames == 180  # 6.0s * 30fps
    assert tl.scenes[0].startFrame == 0
    assert tl.scenes[0].durationFrames == 60
    assert tl.scenes[0].effect.type is not None
    assert tl.scenes[0].transitionOut is not None

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
