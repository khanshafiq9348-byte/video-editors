Add-Type -AssemblyName System.Speech
 = New-Object System.Speech.Synthesis.SpeechSynthesizer
.SetOutputToWaveFile('real_speech.wav')
.Speak('Welcome to the automatic video editor. In this scene we explore beautiful landscapes and dramatic mountains. Finally we conclude our journey with breathtaking views across the sunset.')
.Dispose()
