Set s = CreateObject("SAPI.SpVoice")
Set fs = CreateObject("SAPI.SpFileStream")
fs.Open "real_speech.wav", 3, False
Set s.AudioOutputStream = fs
s.Speak "Welcome to the automatic video editor. In this scene we explore beautiful landscapes and dramatic mountains. Finally we conclude our journey with breathtaking views across the sunset."
fs.Close
