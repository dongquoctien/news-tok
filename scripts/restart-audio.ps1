# Restart Windows audio services + (optionally) the audio driver.
#
# Use when the whole laptop has gone silent after running news-tok
# Studio for a while. Saves a full PC restart in most cases.
#
# Why this works: on Windows 11 (especially build 26200.x), heavy
# browser audio use -- WaveSurfer.js in the bgMusic trim dialog,
# HTMLAudioElement previews in the music / voice / sfx pickers, and
# the Remotion <Player> running narration + music -- can leave the
# Windows Audio Service (`Audiosrv`) holding stale WASAPI session
# handles. Every app that opens audio after that point falls back to
# silence. Restarting the service drops those handles without losing
# your work.
#
# Usage (run as Administrator):
#
#   pwsh -File scripts/restart-audio.ps1
#
# Or right-click -> "Run with PowerShell (Admin)".
#
# What it does, in order:
#   1. Restart Audiosrv (Windows Audio).
#   2. Restart AudioEndpointBuilder (which Audiosrv depends on).
#   3. If silence persists, prints the audio device id you can pass
#      to `pnputil /restart-device <id>` for a driver-level recycle.
#
# No data is touched. Closing browser tabs is NOT required.

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Stop-ServiceWithDependents {
    param([string]$ServiceName)

    # On some OEM builds (notably Toshiba laptops where TPHKLOAD --
    # the hotkey driver service -- depends on AudioEndpointBuilder),
    # `Restart-Service -Force` refuses to stop the target because a
    # dependent service is locking it. We have to walk the dependency
    # tree manually, stop each dependent, then stop the target.
    $svc = Get-Service -Name $ServiceName -ErrorAction Stop
    $dependents = $svc.DependentServices | Where-Object { $_.Status -eq 'Running' }

    foreach ($dep in $dependents) {
        Write-Host "    Stopping dependent: $($dep.Name) ($($dep.DisplayName))" -ForegroundColor DarkGray
        try {
            Stop-Service -Name $dep.Name -Force -ErrorAction Stop
        } catch {
            # Dependent refuses to stop -- try `sc.exe stop` as fallback
            # (uses SCM directly, bypasses some PowerShell quirks).
            Write-Host "      retry via sc.exe..." -ForegroundColor DarkGray
            & sc.exe stop $dep.Name | Out-Null
            Start-Sleep -Milliseconds 800
        }
    }

    Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    return $dependents
}

function Start-ServiceWithDependents {
    param(
        [string]$ServiceName,
        $Dependents
    )
    Start-Service -Name $ServiceName -ErrorAction Stop
    # Restart the dependents we stopped earlier so the laptop keeps
    # working (TPHKLOAD = hotkeys, etc).
    foreach ($dep in $Dependents) {
        try {
            Start-Service -Name $dep.Name -ErrorAction Stop
            Write-Host "    Resumed dependent: $($dep.Name)" -ForegroundColor DarkGray
        } catch {
            Write-Host "    Could not auto-restart $($dep.Name) -- start it from services.msc if needed." -ForegroundColor DarkYellow
        }
    }
}

function Restart-AudioService {
    param([string]$ServiceName)

    Write-Step "Restarting $ServiceName ..."
    try {
        $deps = Stop-ServiceWithDependents -ServiceName $ServiceName
        Start-ServiceWithDependents -ServiceName $ServiceName -Dependents $deps
        Write-Host "    OK" -ForegroundColor Green
    } catch {
        Write-Warning "Failed to restart $ServiceName : $($_.Exception.Message)"
        Write-Warning "  (Are you running PowerShell as Administrator?)"
        exit 1
    }
}

# AudioEndpointBuilder must come BEFORE Audiosrv since Audiosrv depends
# on it. Restarting them in the other order leaves Audiosrv momentarily
# without an endpoint enumerator and it logs a warning to the Event Log.
Restart-AudioService -ServiceName 'AudioEndpointBuilder'
Restart-AudioService -ServiceName 'Audiosrv'

Write-Host ""
Write-Host "Audio services restarted." -ForegroundColor Green
Write-Host "Try playing something now. If you still hear no sound, try:"
Write-Host ""

# Surface the active render device id so the user can run pnputil
# without hunting through Device Manager.
try {
    $renderDevices = Get-PnpDevice -Class 'AudioEndpoint' -Status OK -ErrorAction Stop |
        Where-Object { $_.FriendlyName -notlike '*Microphone*' -and $_.FriendlyName -notlike '*Mic *' }
    foreach ($d in $renderDevices) {
        Write-Host "  pnputil /restart-device `"$($d.InstanceId)`"" -ForegroundColor Yellow
        Write-Host "      ($($d.FriendlyName))"
    }
} catch {
    Write-Host "  pnputil /enum-devices /class AudioEndpoint" -ForegroundColor Yellow
    Write-Host "    then: pnputil /restart-device [InstanceId]"
}

Write-Host ""
Write-Host "Or as a last resort: restart the laptop." -ForegroundColor DarkGray
