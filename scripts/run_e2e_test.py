import urllib.request
import json
import os

with open('test_pid.txt') as f:
    pid = f.read().strip()

print(f"Testing with project ID: {pid}")

# Get images from proj_5160ada2
res = urllib.request.urlopen('http://127.0.0.1:8000/api/projects/proj_5160ada2')
src_p = json.loads(res.read())
images = [a for a in src_p.get('assets', []) if a['type'] == 'image'][:5]

boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'

def upload_file(file_path, original_name):
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    
    body = bytearray()
    body.extend(f'--{boundary}\r\n'.encode('utf-8'))
    body.extend(f'Content-Disposition: form-data; name="files"; filename="{original_name}"\r\n'.encode('utf-8'))
    body.extend(b'Content-Type: application/octet-stream\r\n\r\n')
    body.extend(file_bytes)
    body.extend(f'\r\n--{boundary}--\r\n'.encode('utf-8'))
    
    req = urllib.request.Request(
        f'http://127.0.0.1:8000/api/projects/{pid}/media',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary}'}
    )
    res = urllib.request.urlopen(req)
    return json.loads(res.read())

print("Uploading test audio test_out.wav...")
upload_file('test_out.wav', 'voiceover.wav')
print("Audio uploaded.")

print("Uploading 5 images...")
for img in images:
    img_path = img['storage_path']
    if not os.path.isabs(img_path):
        img_path = os.path.abspath(img_path)
    if not os.path.exists(img_path):
        candidate = os.path.join(os.getcwd(), 'storage', 'projects', 'proj_5160ada2', 'assets', os.path.basename(img_path))
        if os.path.exists(candidate):
            img_path = candidate
    print(f"Uploading {img['original_name']} ({img_path})...")
    upload_file(img_path, img['original_name'])

print("All assets uploaded!")
