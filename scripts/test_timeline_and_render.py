import urllib.request
import json
import time
import os

with open('test_pid.txt') as f:
    pid = f.read().strip()

print(f"--- 1. Testing Audio Analysis for {pid} ---")
req = urllib.request.Request(
    f'http://127.0.0.1:8000/api/projects/{pid}/analyze-audio',
    data=b'',
    headers={'Content-Type': 'application/json'}
)
res = urllib.request.urlopen(req)
raw = res.read()
analysis = json.loads(raw)
sentences = analysis if isinstance(analysis, list) else analysis.get('sentences', [])
print(f"Sentences detected ({len(sentences)}):")
for s in sentences:
    print(f"  Sentence [{s['id']}]: ({s['start_time']:.2f}s - {s['end_time']:.2f}s) -> '{s['text']}'")

print("\n--- 2. Testing Timeline Generation with 'varied' transition style ---")
req = urllib.request.Request(
    f'http://127.0.0.1:8000/api/projects/{pid}/generate-timeline',
    data=b'',
    headers={'Content-Type': 'application/json'}
)
res = urllib.request.urlopen(req)
timeline = json.loads(res.read())
scenes = timeline.get('scenes', [])
print(f"Generated {len(scenes)} scenes for timeline:")
for i, sc in enumerate(scenes):
    t_out = sc.get('transitionOut')
    t_name = t_out.get('type') if t_out else 'none'
    s_id = sc.get('sentenceId')
    print(f"  Scene {i+1} [{sc['id']}]: startFrame={sc['startFrame']}, dur={sc['durationFrames']}, sentenceId={s_id}, transitionOut={t_name}, effect={sc['effect']['type']}")

transitions_list = [sc.get('transitionOut', {}).get('type') for sc in scenes if sc.get('transitionOut')]
print(f"\nTransition Sequence: {transitions_list}")
# Check that transitions do not repeat the exact same transition back-to-back if varied
has_repetition = False
for i in range(len(transitions_list) - 1):
    if transitions_list[i] == transitions_list[i+1] and transitions_list[i] != 'crossfade':
        has_repetition = True
print(f"Repeated consecutive transition? {has_repetition}")

print("\n--- 3. Testing Full Video Export ---")
req = urllib.request.Request(
    f'http://127.0.0.1:8000/api/projects/{pid}/render',
    data=json.dumps({
        'width': 1280,
        'height': 720,
        'fps': 30,
        'quality': 'standard',
        'burn_captions': True
    }).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
res = urllib.request.urlopen(req)
render_job = json.loads(res.read())
job_id = render_job['id']
print(f"Render job started: {job_id}, status={render_job.get('status')}")

# Poll render status until complete or failed
print("Waiting for render completion...")
for attempt in range(60):
    time.sleep(2)
    job_res = urllib.request.urlopen(f'http://127.0.0.1:8000/api/render-jobs/{job_id}')
    job_data = json.loads(job_res.read())
    status = job_data.get('status')
    progress = job_data.get('progress', 0)
    print(f"  [Attempt {attempt+1}] Render status: {status}, progress={progress:.1f}%")
    if status == 'completed':
        print("\nSUCCESS: Video export completed!")
        print(f"Output file: {job_data.get('output_file')}")
        print(f"Download URL: {job_data.get('download_url')}")
        output_path = job_data.get('output_file')
        if output_path and os.path.exists(output_path):
            file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
            print(f"Verified output file exists! Size: {file_size_mb:.2f} MB")
        break
    elif status in ['failed', 'cancelled']:
        print(f"\nERROR: Render {status}! Error: {job_data.get('error_message')}")
        break
