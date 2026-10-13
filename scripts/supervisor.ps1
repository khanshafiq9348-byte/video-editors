# AutoVideo Studio - Process Supervisor for Windows
# Manages FastAPI backend (8000) and Vite frontend (5173) with auto-restart on crash

param(
    [switch]$NoBrowser = $false
)

$ErrorActionPreference = "Continue"

# Resolve root path
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..").Path
$storageDir = Join-Path $rootDir "storage"
$logsDir = Join-Path $storageDir "logs"

if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$supervisorLog = Join-Path $logsDir "supervisor.log"
$backendLog = Join-Path $logsDir "backend.log"
$frontendLog = Join-Path $logsDir "frontend.log"
$supervisorPidFile = Join-Path $storageDir "supervisor.pid"
$backendPidFile = Join-Path $storageDir "backend.pid"
$frontendPidFile = Join-Path $storageDir "frontend.pid"

function Log-Message([string]$msg) {
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$timestamp] $msg"
    Write-Host $line
    Add-Content -Path $supervisorLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

Log-Message "=== AutoVideo Studio Supervisor Starting ==="
Log-Message "Root directory: $rootDir"

# Write Supervisor PID
$PID | Out-File -FilePath $supervisorPidFile -Encoding ASCII -Force

# Helper function to check if port is in use
function Get-ProcessByPort([int]$port) {
    try {
        $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if ($conns) {
            return $conns[0].OwningProcess
        }
    } catch {}
    return $null
}

# Helper function to test HTTP health
function Test-HttpHealth([string]$url, [int]$timeoutSec = 3) {
    try {
        $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $timeoutSec -ErrorAction Stop
        return ($res.StatusCode -eq 200)
    } catch {
        return $false
    }
}

# Global process variables
$global:backendProc = $null
$global:frontendProc = $null

function Start-BackendServer {
    Log-Message "Starting FastAPI backend on port 8000..."
    
    # Check if port 8000 is occupied by something else
    $existingPid = Get-ProcessByPort 8000
    if ($existingPid) {
        $isHealthy = Test-HttpHealth "http://127.0.0.1:8000/api/health" 2
        if ($isHealthy) {
            Log-Message "Backend is already running and healthy (PID $existingPid)."
            $existingPid | Out-File -FilePath $backendPidFile -Encoding ASCII -Force
            return $true
        } else {
            Log-Message "Stale process found on port 8000 (PID $existingPid). Terminating..."
            Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }

    $backendDir = Join-Path $rootDir "backend"
    $pythonExe = "python.exe"

    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = $pythonExe
    $pinfo.Arguments = "-m uvicorn app.main:app --host 127.0.0.1 --port 8000"
    $pinfo.WorkingDirectory = $backendDir
    $pinfo.UseShellExecute = $false
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $pinfo

    # Async logging to backend.log
    Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action {
        if ($EventArgs.Data) {
            Add-Content -Path $Event.MessageData -Value $EventArgs.Data -Encoding UTF8 -ErrorAction SilentlyContinue
        }
    } -MessageData $backendLog | Out-Null

    Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -Action {
        if ($EventArgs.Data) {
            Add-Content -Path $Event.MessageData -Value $EventArgs.Data -Encoding UTF8 -ErrorAction SilentlyContinue
        }
    } -MessageData $backendLog | Out-Null

    $started = $proc.Start()
    if (-not $started) {
        Log-Message "ERROR: Failed to launch backend process."
        return $false
    }

    $proc.BeginOutputReadLine()
    $proc.BeginErrorReadLine()
    $global:backendProc = $proc

    $proc.Id | Out-File -FilePath $backendPidFile -Encoding ASCII -Force
    Log-Message "Backend process started (PID $($proc.Id)). Waiting for health check..."

    # Wait for backend health
    $retries = 30
    while ($retries -gt 0) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) {
            Log-Message "ERROR: Backend exited prematurely with code $($proc.ExitCode)."
            return $false
        }
        if (Test-HttpHealth "http://127.0.0.1:8000/api/health" 2) {
            Log-Message "Backend is HEALTHY at http://127.0.0.1:8000/api/health"
            return $true
        }
        $retries--
    }

    Log-Message "WARNING: Backend health check timed out."
    return $false
}

function Start-FrontendServer {
    Log-Message "Starting Vite frontend on port 5173..."

    $existingPid = Get-ProcessByPort 5173
    if ($existingPid) {
        $isHealthy = Test-HttpHealth "http://127.0.0.1:5173" 2
        if ($isHealthy) {
            Log-Message "Frontend is already running and healthy (PID $existingPid)."
            $existingPid | Out-File -FilePath $frontendPidFile -Encoding ASCII -Force
            return $true
        } else {
            Log-Message "Stale process found on port 5173 (PID $existingPid). Terminating..."
            Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
    }

    $frontendDir = Join-Path $rootDir "frontend"
    $viteBin = Join-Path $frontendDir "node_modules\vite\bin\vite.js"

    $pinfo = New-Object System.Diagnostics.ProcessStartInfo
    $pinfo.FileName = "node.exe"
    $pinfo.Arguments = "`"$viteBin`" --host 127.0.0.1 --port 5173"
    $pinfo.WorkingDirectory = $frontendDir
    $pinfo.UseShellExecute = $false
    $pinfo.RedirectStandardOutput = $true
    $pinfo.RedirectStandardError = $true
    $pinfo.CreateNoWindow = $true

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $pinfo

    Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action {
        if ($EventArgs.Data) {
            Add-Content -Path $Event.MessageData -Value $EventArgs.Data -Encoding UTF8 -ErrorAction SilentlyContinue
        }
    } -MessageData $frontendLog | Out-Null

    Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived -Action {
        if ($EventArgs.Data) {
            Add-Content -Path $Event.MessageData -Value $EventArgs.Data -Encoding UTF8 -ErrorAction SilentlyContinue
        }
    } -MessageData $frontendLog | Out-Null

    $started = $proc.Start()
    if (-not $started) {
        Log-Message "ERROR: Failed to launch frontend process."
        return $false
    }

    $proc.BeginOutputReadLine()
    $proc.BeginErrorReadLine()
    $global:frontendProc = $proc

    $proc.Id | Out-File -FilePath $frontendPidFile -Encoding ASCII -Force
    Log-Message "Frontend process started (PID $($proc.Id)). Waiting for response..."

    # Wait for frontend readiness
    $retries = 30
    while ($retries -gt 0) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) {
            Log-Message "ERROR: Frontend exited prematurely with code $($proc.ExitCode)."
            return $false
        }
        if (Test-HttpHealth "http://127.0.0.1:5173" 2) {
            Log-Message "Frontend is READY at http://127.0.0.1:5173"
            return $true
        }
        $retries--
    }

    Log-Message "WARNING: Frontend ready check timed out."
    return $false
}

# Cleanup on supervisor exit
$cleanupAction = {
    Log-Message "Stopping supervised servers..."
    if ($global:backendProc -and -not $global:backendProc.HasExited) {
        try { Stop-Process -Id $global:backendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    if ($global:frontendProc -and -not $global:frontendProc.HasExited) {
        try { Stop-Process -Id $global:frontendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    Remove-Item $supervisorPidFile -Force -ErrorAction SilentlyContinue
    Remove-Item $backendPidFile -Force -ErrorAction SilentlyContinue
    Remove-Item $frontendPidFile -Force -ErrorAction SilentlyContinue
    Log-Message "Supervisor shutdown complete."
}

# Initial start sequence
$backendOk = Start-BackendServer
if (-not $backendOk) {
    Log-Message "ERROR: Backend startup failed. Will continue supervisor to attempt recovery."
}

$frontendOk = Start-FrontendServer
if (-not $frontendOk) {
    Log-Message "ERROR: Frontend startup failed. Will continue supervisor to attempt recovery."
}

# Open browser if requested
if (-not $NoBrowser) {
    Log-Message "Opening application in default web browser: http://127.0.0.1:5173"
    try {
        Start-Process "http://127.0.0.1:5173"
    } catch {
        Log-Message "Could not open browser automatically: $_"
    }
}

Log-Message "Supervisor is now in active monitoring loop (auto-restart enabled)."

# Watchdog loop
$backendFailCount = 0
$frontendFailCount = 0

try {
    while ($true) {
        Start-Sleep -Seconds 5

        # Check Backend Health
        $backendHealthy = Test-HttpHealth "http://127.0.0.1:8000/api/health" 2
        if (-not $backendHealthy) {
            $backendFailCount++
            Log-Message "Backend health check failed (failure count: $backendFailCount)."
            if ($backendFailCount -ge 2) {
                Log-Message "Backend appears down or crashed. Initiating restart..."
                if ($global:backendProc -and -not $global:backendProc.HasExited) {
                    try { Stop-Process -Id $global:backendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
                }
                $bPortPid = Get-ProcessByPort 8000
                if ($bPortPid) {
                    try { Stop-Process -Id $bPortPid -Force -ErrorAction SilentlyContinue } catch {}
                }
                Start-BackendServer
                $backendFailCount = 0
            }
        } else {
            $backendFailCount = 0
        }

        # Check Frontend Health
        $frontendHealthy = Test-HttpHealth "http://127.0.0.1:5173" 2
        if (-not $frontendHealthy) {
            $frontendFailCount++
            Log-Message "Frontend health check failed (failure count: $frontendFailCount)."
            if ($frontendFailCount -ge 2) {
                Log-Message "Frontend appears down or crashed. Initiating restart..."
                if ($global:frontendProc -and -not $global:frontendProc.HasExited) {
                    try { Stop-Process -Id $global:frontendProc.Id -Force -ErrorAction SilentlyContinue } catch {}
                }
                $fPortPid = Get-ProcessByPort 5173
                if ($fPortPid) {
                    try { Stop-Process -Id $fPortPid -Force -ErrorAction SilentlyContinue } catch {}
                }
                Start-FrontendServer
                $frontendFailCount = 0
            }
        } else {
            $frontendFailCount = 0
        }
    }
} finally {
    & $cleanupAction
}
