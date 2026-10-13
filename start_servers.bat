@echo off
setlocal
cd /d "%~dp0"
echo [AutoVideo Studio] Starting servers...
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\start_servers.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Server start failed with code %ERRORLEVEL%
    pause
)
