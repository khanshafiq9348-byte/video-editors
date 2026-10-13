# AutoVideo Studio - Server Status Inspector

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..").Path
$storageDir = Join-Path $rootDir "storage"
$logsDir = Join-Path $storageDir "logs"
$supervisorPidFile = Join-Path $storageDir "supervisor.pid"
$backendPidFile = Join-Path $storageDir "backend.pid"
$frontendPidFile = Join-Path $storageDir "frontend.pid"

function Get-PortStatus([int]$port) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            $p = Get-Process -Id $conns[0].OwningProcess -ErrorAction SilentlyContinue
            return @{
                Listening = $true
                Pid = $conns[0].OwningProcess
                ProcessName = if ($p) { $p.ProcessName } else { "Unknown" }
            }
        }
    } catch {}
    return @{ Listening = $false; Pid = $null; ProcessName = "None" }
}

function Test-HttpHealth([string]$url, [int]$timeoutSec = 2) {
    try {
        $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $timeoutSec -ErrorAction Stop
        return @{ Ok = ($res.StatusCode -eq 200); Code = $res.StatusCode; Content = $res.Content }
    } catch {
        return @{ Ok = $false; Code = 0; Content = $_.Exception.Message }
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "       AutoVideo Studio Server Status Check               " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Supervisor Check
$supStatus = "NOT RUNNING"
$supPid = "None"
if (Test-Path $supervisorPidFile) {
    $pVal = Get-Content $supervisorPidFile -ErrorAction SilentlyContinue
    if ($pVal) {
        $proc = Get-Process -Id $pVal -ErrorAction SilentlyContinue
        if ($proc) {
            $supStatus = "RUNNING (Active Watchdog)"
            $supPid = $pVal
        }
    }
}
$supFg = if ($supStatus -like "*RUNNING*") { "Green" } else { "Yellow" }
Write-Host "Supervisor Service: $supStatus [PID: $supPid]" -ForegroundColor $supFg

# 2. Backend Check (Port 8000)
$backendPort = Get-PortStatus 8000
$backendHttp = Test-HttpHealth "http://127.0.0.1:8000/api/health" 2
$bText = if ($backendHttp.Ok) { 'HEALTHY (HTTP 200)' } else { 'DOWN' }
$bFg = if ($backendHttp.Ok) { "Green" } else { "Red" }
Write-Host "`nBackend (FastAPI - Port 8000):" -ForegroundColor White
Write-Host "  Port 8000 Listening: $($backendPort.Listening) (PID: $($backendPort.Pid), Process: $($backendPort.ProcessName))"
Write-Host "  Health Endpoint:     $bText" -ForegroundColor $bFg
if ($backendHttp.Ok) {
    Write-Host "  Response:            $($backendHttp.Content)" -ForegroundColor Gray
}

# 3. Frontend Check (Port 5173)
$frontendPort = Get-PortStatus 5173
$frontendHttp = Test-HttpHealth "http://127.0.0.1:5173" 2
$fText = if ($frontendHttp.Ok) { 'READY (HTTP 200)' } else { 'DOWN' }
$fFg = if ($frontendHttp.Ok) { "Green" } else { "Red" }
Write-Host "`nFrontend (Vite - Port 5173):" -ForegroundColor White
Write-Host "  Port 5173 Listening: $($frontendPort.Listening) (PID: $($frontendPort.Pid), Process: $($frontendPort.ProcessName))"
Write-Host "  UI Endpoint:         $fText" -ForegroundColor $fFg

# 4. Logs summary
Write-Host "`nLog Files Location:" -ForegroundColor White
Write-Host "  Supervisor Log: $(Join-Path $logsDir 'supervisor.log')"
Write-Host "  Backend Log:    $(Join-Path $logsDir 'backend.log')"
Write-Host "  Frontend Log:   $(Join-Path $logsDir 'frontend.log')"

Write-Host "==========================================================" -ForegroundColor Cyan
