import sys, wave, json, os
import vosk
vosk.SetLogLevel(-1)
model = vosk.Model('backend/vosk_models/vosk-model-small-en-us-0.15')
rec = vosk.KaldiRecognizer(model, 16000)
rec.SetWords(True)

wf = wave.open('test_out.wav', 'rb')
words = []
while True:
    data = wf.readframes(4000)
    if len(data) == 0: break
    if rec.AcceptWaveform(data):
        part = json.loads(rec.Result())
        if 'result' in part: words.extend(part['result'])
part = json.loads(rec.FinalResult())
if 'result' in part: words.extend(part['result'])

for w in words:
    print(f"{w['word']:15} {w['start']:6.2f} - {w['end']:6.2f}")
