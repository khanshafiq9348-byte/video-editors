# AutoVideo Studio - Install Windows Auto-Startup
# Creates a silent startup launcher in the user's Windows Startup directory

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..").Path
$startScript = Join-Path $scriptDir "start_servers.ps1"

$startupFolder = [System.Environment]::GetFolderPath('Startup')
if (-not (Test-Path $startupFolder)) {
    $startupFolder = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
}

$vbsPath = Join-Path $startupFolder "AutoVideoStudio.vbs"

$vbsContent = @"
' AutoVideo Studio Windows Auto-Startup Launcher
' Automatically launches background supervisor upon Windows login / reboot
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$rootDir"
WshShell.Run "powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File ""$startScript""", 0, False
"@

Set-Content -Path $vbsPath -Value $vbsContent -Encoding ASCII

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Windows Startup Entry Installed Successfully!           " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "Startup File: $vbsPath"
Write-Host "Target:       $startScript"
Write-Host "The application will now automatically start on every Windows login/restart."
