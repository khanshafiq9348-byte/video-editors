@echo off
setlocal
cd /d "%~dp0.."
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0uninstall_startup.ps1"
pause
