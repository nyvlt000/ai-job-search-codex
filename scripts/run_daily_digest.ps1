# Primary daily digest runner (Windows Task Scheduler).
# Schedule: 08:00 Europe/Berlin with "Wake the computer to run this task".

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" +
            "$env:USERPROFILE\.bun\bin;" +
            $env:Path

$LogDir = Join-Path $RepoRoot "digests\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$LogFile = Join-Path $LogDir "digest_$stamp.log"

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "o"), $Message
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

Write-Log "Starting daily digest in $RepoRoot"

$py = Get-Command py -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command python -ErrorAction SilentlyContinue }
if (-not $py) { throw "Python (py/python) not found on PATH" }

$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) { throw "bun not found on PATH" }

& $py.Source tools/daily_digest.py --send --source primary *>> $LogFile
$code = $LASTEXITCODE
Write-Log "daily_digest.py exited with $code"

# Push success heartbeat to digest-heartbeat branch when run succeeded
$day = Get-Date -Format "yyyy-MM-dd"
$hb = Join-Path $RepoRoot "digest_runs\$day.ok"
if (($code -eq 0) -and (Test-Path $hb)) {
  try {
    Write-Log "Pushing heartbeat $day"
    git fetch origin digest-heartbeat:digest-heartbeat 2>> $LogFile
    git stash push -u -m "digest-temp" 2>> $LogFile | Out-Null
    git checkout -B digest-heartbeat 2>> $LogFile
    New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "digest_runs") | Out-Null
    Copy-Item $hb (Join-Path $RepoRoot "digest_runs\$day.ok") -Force
    git add "digest_runs/$day.ok" 2>> $LogFile
    git -c user.email="digest-bot@local" -c user.name="digest-bot" commit -m "heartbeat $day" 2>> $LogFile
    git push -u origin digest-heartbeat 2>> $LogFile
    git checkout - 2>> $LogFile
    git stash pop 2>> $LogFile | Out-Null
    Write-Log "Heartbeat push attempted"
  } catch {
    Write-Log "Heartbeat push failed: $_"
  }
}

exit $code
