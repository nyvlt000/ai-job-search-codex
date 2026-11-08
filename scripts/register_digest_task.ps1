# Register Windows Task Scheduler job for the daily digest.
# Run once from an elevated or normal PowerShell in the repo.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Script = Join-Path $RepoRoot "scripts\run_daily_digest.ps1"
$TaskName = "JobSearchDailyDigest"

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Script`"" `
  -WorkingDirectory $RepoRoot

# 08:00 local time — set the PC timezone to Europe/Berlin (CET/CEST).
$trigger = New-ScheduledTaskTrigger -Daily -At 8:00AM

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Limited run level avoids elevation prompt / Access Denied in non-admin shells.
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null
} catch {
  Write-Warning "Register-ScheduledTask failed: $_"
  Write-Host "Register manually: Task Scheduler → Create Task → Daily 08:00,"
  Write-Host "  Action: powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Script`""
  Write-Host "  Settings: Wake the computer to run this task"
  throw
}

Write-Host "Registered scheduled task '$TaskName' daily 08:00 with WakeToRun."
Write-Host "Ensure Windows timezone is (UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna."
Write-Host "Set RESEND_API_KEY and RESEND_FROM as User environment variables."
Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State
