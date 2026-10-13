@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0install_startup.ps1"
pause
