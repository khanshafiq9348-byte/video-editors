# AutoVideo Studio - Stop All Servers (Idempotent & Graceful)

$ErrorActionPreference = "Continue"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..").Path
$storageDir = Join-Path $rootDir "storage"
$logsDir = Join-Path $storageDir "logs"
$supervisorLog = Join-Path $logsDir "supervisor.log"

$supervisorPidFile = Join-Path $storageDir "supervisor.pid"
$backendPidFile = Join-Path $storageDir "backend.pid"
$frontendPidFile = Join-Path $storageDir "frontend.pid"

function Log-Message([string]$msg) {
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$timestamp] $msg"
    Write-Host $line
    if (Test-Path $logsDir) {
        Add-Content -Path $supervisorLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    }
}

Log-Message "Stopping AutoVideo Studio servers..."

# 1. Stop Supervisor process if running
if (Test-Path $supervisorPidFile) {
    $supPid = Get-Content $supervisorPidFile -ErrorAction SilentlyContinue
    if ($supPid) {
        $p = Get-Process -Id $supPid -ErrorAction SilentlyContinue
        if ($p) {
            Log-Message "Stopping supervisor process (PID $supPid)..."
            Stop-Process -Id $supPid -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item $supervisorPidFile -Force -ErrorAction SilentlyContinue
}

# 2. Stop Backend process from PID file
if (Test-Path $backendPidFile) {
    $bPid = Get-Content $backendPidFile -ErrorAction SilentlyContinue
    if ($bPid) {
        $p = Get-Process -Id $bPid -ErrorAction SilentlyContinue
        if ($p) {
            Log-Message "Stopping backend process (PID $bPid)..."
            Stop-Process -Id $bPid -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item $backendPidFile -Force -ErrorAction SilentlyContinue
}

# 3. Stop Frontend process from PID file
if (Test-Path $frontendPidFile) {
    $fPid = Get-Content $frontendPidFile -ErrorAction SilentlyContinue
    if ($fPid) {
        $p = Get-Process -Id $fPid -ErrorAction SilentlyContinue
        if ($p) {
            Log-Message "Stopping frontend process (PID $fPid)..."
            Stop-Process -Id $fPid -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item $frontendPidFile -Force -ErrorAction SilentlyContinue
}

# 4. Terminate any lingering processes bound to ports 8000 and 5173
function Kill-PortProcess([int]$port, [string]$name) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $conns) {
            $pidToKill = $conn.OwningProcess
            if ($pidToKill -and $pidToKill -ne 0) {
                Log-Message "Terminating lingering $name process on port $port (PID $pidToKill)..."
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        # Fallback to netstat
        $netstatLines = netstat -ano | Select-String ":$port\s+.*LISTENING\s+(\d+)"
        foreach ($line in $netstatLines) {
            if ($line.Matches.Groups[1].Value) {
                $pidToKill = $line.Matches.Groups[1].Value
                Log-Message "Terminating lingering $name process via netstat on port $port (PID $pidToKill)..."
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

Kill-PortProcess 8000 "Backend"
Kill-PortProcess 5173 "Frontend"

Start-Sleep -Seconds 1

# Check verification
$backendOpen = $null
$frontendOpen = $null
try {
    $backendOpen = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    $frontendOpen = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
} catch {}

if ($backendOpen -or $frontendOpen) {
    Log-Message "WARNING: Some port listeners could not be stopped immediately."
} else {
    Log-Message "SUCCESS: All AutoVideo Studio servers stopped cleanly. Ports 8000 and 5173 are free."
}
