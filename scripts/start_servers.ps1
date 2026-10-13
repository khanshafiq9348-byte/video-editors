# AutoVideo Studio - Start Servers (Idempotent background supervisor launcher)

param(
    [switch]$NoBrowser = $false
)

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..").Path
$storageDir = Join-Path $rootDir "storage"
$logsDir = Join-Path $storageDir "logs"
$supervisorLog = Join-Path $logsDir "supervisor.log"
$supervisorScript = Join-Path $scriptDir "supervisor.ps1"
$supervisorPidFile = Join-Path $storageDir "supervisor.pid"

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

function Log-Message([string]$msg) {
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$timestamp] $msg"
    Write-Host $line
    Add-Content -Path $supervisorLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

function Test-HttpHealth([string]$url, [int]$timeoutSec = 2) {
    try {
        $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $timeoutSec -ErrorAction Stop
        return ($res.StatusCode -eq 200)
    } catch {
        return $false
    }
}

Log-Message "Checking current server status..."

$backendHealthy = Test-HttpHealth "http://127.0.0.1:8000/api/health" 2
$frontendHealthy = Test-HttpHealth "http://127.0.0.1:5173" 2

if ($backendHealthy -and $frontendHealthy) {
    Log-Message "All servers are already running and healthy!"
    Log-Message "  Frontend URL: http://127.0.0.1:5173"
    Log-Message "  Backend API:  http://127.0.0.1:8000/api/health"
    if (-not $NoBrowser) {
        Log-Message "Opening browser at http://127.0.0.1:5173"
        Start-Process "http://127.0.0.1:5173"
    }
    exit 0
}

# If supervisor is running but servers aren't healthy yet, let supervisor do its job
$supRunning = $false
if (Test-Path $supervisorPidFile) {
    $supPid = Get-Content $supervisorPidFile -ErrorAction SilentlyContinue
    if ($supPid -and (Get-Process -Id $supPid -ErrorAction SilentlyContinue)) {
        $supRunning = $true
    }
}

if (-not $supRunning) {
    Log-Message "Launching background supervisor process..."
    $argList = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$supervisorScript`""
    if ($NoBrowser) {
        $argList += " -NoBrowser"
    }

    Start-Process -FilePath "powershell.exe" -ArgumentList $argList -WorkingDirectory $rootDir
} else {
    Log-Message "Supervisor is already running in background (PID $supPid)."
}

# Wait for both services to become ready
Log-Message "Waiting for backend (8000) and frontend (5173) to become ready..."
$maxWait = 35
$elapsed = 0
$ready = $false

while ($elapsed -lt $maxWait) {
    Start-Sleep -Seconds 2
    $elapsed += 2
    $backendHealthy = Test-HttpHealth "http://127.0.0.1:8000/api/health" 2
    $frontendHealthy = Test-HttpHealth "http://127.0.0.1:5173" 2

    if ($backendHealthy -and $frontendHealthy) {
        $ready = $true
        break
    }
    Write-Host -NoNewline "."
}
Write-Host ""

if ($ready) {
    Log-Message "=========================================================="
    Log-Message " SUCCESS: AutoVideo Studio servers are ready and healthy! "
    Log-Message " Frontend:   http://127.0.0.1:5173"
    Log-Message " Backend:    http://127.0.0.1:8000"
    Log-Message " API Docs:   http://127.0.0.1:8000/docs"
    Log-Message " Logs:       $logsDir"
    Log-Message "=========================================================="
} else {
    Log-Message "WARNING: One or more services did not respond within $maxWait seconds."
    Log-Message "Backend healthy: $backendHealthy | Frontend healthy: $frontendHealthy"
    Log-Message "Check log files in $logsDir for detailed errors."
}
