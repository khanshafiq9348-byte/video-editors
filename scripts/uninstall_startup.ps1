# AutoVideo Studio - Remove Windows Auto-Startup Entry

$ErrorActionPreference = "Continue"

$startupFolder = [System.Environment]::GetFolderPath('Startup')
if (-not (Test-Path $startupFolder)) {
    $startupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
}

$vbsPath = Join-Path $startupFolder "AutoVideoStudio.vbs"

if (Test-Path $vbsPath) {
    Remove-Item $vbsPath -Force -ErrorAction SilentlyContinue
    Write-Host "Removed Windows Startup launcher: $vbsPath" -ForegroundColor Green
} else {
    Write-Host "No Windows Startup launcher found at: $vbsPath" -ForegroundColor Yellow
}
