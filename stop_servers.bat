@echo off
setlocal
cd /d "%~dp0"
echo [AutoVideo Studio] Stopping all servers...
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\stop_servers.ps1"
