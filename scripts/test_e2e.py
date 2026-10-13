import os
import sys
import json
import time
import subprocess
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.main import app

def run_end_to_end_test():
    print("="*60)
    print("RUNNING END-TO-END VIDEO EDITOR SMOKE TEST")
    print("="*60)

    client = TestClient(app)

    # 1. Create project
    print("\n1. Creating test project...")
    create_res = client.post("/api/projects", json={"name": "End-to-End Test Project"})
    assert create_res.status_code == 200, f"Create project failed: {create_res.text}"
    project = create_res.json()
    proj_id = project["id"]
    print(f"Created project: {proj_id}")

    fixtures_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "test_fixtures"))

    # 2. Upload images
    print("\n2. Uploading 3 images...")
    img_files = [
        ("files", ("img1.png", open(os.path.join(fixtures_dir, "test_img1.png"), "rb"), "image/png")),
        ("files", ("img2.png", open(os.path.join(fixtures_dir, "test_img2.png"), "rb"), "image/png")),
        ("files", ("img3.png", open(os.path.join(fixtures_dir, "test_img3.png"), "rb"), "image/png")),
    ]
    img_res = client.post(f"/api/projects/{proj_id}/images", files=img_files)
    assert img_res.status_code == 200, f"Upload images failed: {img_res.text}"
    uploaded_images = img_res.json()
    print(f"Uploaded {len(uploaded_images)} images successfully.")

    # 3. Upload voiceover audio
    print("\n3. Uploading voiceover audio...")
    audio_file = ("file", ("voiceover.mp3", open(os.path.join(fixtures_dir, "test_voiceover.mp3"), "rb"), "audio/mp3"))
    audio_res = client.post(f"/api/projects/{proj_id}/audio", files=[audio_file])
    assert audio_res.status_code == 200, f"Upload audio failed: {audio_res.text}"
    audio_asset = audio_res.json()
    print(f"Uploaded audio duration: {audio_asset.get('duration')}s")

    # 4. Analyze voiceover audio
    print("\n4. Analyzing voiceover audio...")
    analyze_res = client.post(f"/api/projects/{proj_id}/analyze-audio")
    assert analyze_res.status_code == 200, f"Audio analysis failed: {analyze_res.text}"
    sentences = analyze_res.json()
    print(f"Detected {len(sentences)} sentence segment(s):")
    for s in sentences:
        print(f"  [{s['start_time']}s - {s['end_time']}s]: {s['text']}")

    # 5. Auto generate video timeline
    print("\n5. Auto generating video timeline...")
    tl_res = client.post(f"/api/projects/{proj_id}/generate-timeline")
    assert tl_res.status_code == 200, f"Timeline generation failed: {tl_res.text}"
    timeline = tl_res.json()
    print(f"Generated timeline with {len(timeline['scenes'])} scenes, total duration: {timeline['totalDurationFrames']} frames.")

    # 6. Check Waveform
    print("\n6. Fetching audio waveform visualization data...")
    wf_res = client.get(f"/api/projects/{proj_id}/audio/waveform")
    assert wf_res.status_code == 200
    points = wf_res.json()["points"]
    print(f"Generated waveform with {len(points)} sample points.")

    # 7. Render Video (Trigger and wait for worker)
    print("\n7. Triggering MP4 video render...")
    render_res = client.post(f"/api/projects/{proj_id}/render", json={})
    assert render_res.status_code == 200, f"Render trigger failed: {render_res.text}"
    job = render_res.json()
    job_id = job["id"]
    print(f"Render job initiated: {job_id}")

    # Poll render status
    timeout = 120  # 2 minutes max
    start_t = time.time()
    completed_job = None

    while time.time() - start_t < timeout:
        poll_res = client.get(f"/api/render-jobs/{job_id}")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        status = poll_data["status"]
        progress = poll_data["progress"]
        print(f"  Render status: {status} ({progress:.1f}%)")
        if status in ["completed", "failed", "cancelled"]:
            completed_job = poll_data
            break
        time.sleep(2)

    assert completed_job is not None, "Render job timed out!"
    assert completed_job["status"] == "completed", f"Render failed: {completed_job.get('error_message')}"
    output_mp4 = completed_job["output_path"]
    print(f"\nRender completed successfully! Output file: {output_mp4}")
    assert os.path.exists(output_mp4), "Rendered MP4 file does not exist on disk"

    # 8. Verify MP4 with FFprobe
    print("\n8. Verifying MP4 video metadata with FFprobe...")
    probe_cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration,size:stream=codec_name,width,height",
        "-of", "json",
        output_mp4
    ]
    probe_res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    probe_data = json.loads(probe_res.stdout)
    print("FFprobe Verification Data:")
    print(json.dumps(probe_data, indent=2))

    duration = float(probe_data["format"]["duration"])
    assert duration > 3.0, f"Rendered video duration too short: {duration}"
    video_stream = next((s for s in probe_data["streams"] if s.get("codec_name") == "h264"), None)
    assert video_stream is not None, "Missing H.264 video stream in exported MP4"
    print(f"Video Stream confirmed: {video_stream['width']}x{video_stream['height']} {video_stream['codec_name']}")

    print("\n" + "="*60)
    print("SUCCESS: ALL END-TO-END CHECKS PASSED!")
    print("="*60)

if __name__ == "__main__":
    run_end_to_end_test()
