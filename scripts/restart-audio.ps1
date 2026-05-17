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

function Restart-AudiosrvOnly {
    # We only restart Audiosrv (Windows Audio), NOT AudioEndpointBuilder.
    #
    # Why: AudioEndpointBuilder commonly has OEM dependents (TPHKLOAD on
    # Lenovo / Toshiba hotkey loaders, plus a few Realtek + Dell helpers)
    # that refuse to stop even via `sc.exe stop` because the OEM software
    # marks them non-stoppable. Trying to restart AudioEndpointBuilder
    # then fails and the whole script bails out before Audiosrv even
    # gets a chance.
    #
    # Audiosrv is the one that actually holds the WASAPI session handles
    # we want to free, and it has NO dependents on a clean Windows
    # install -- so restarting just Audiosrv is both sufficient for the
    # stale-handle freeze AND safe across OEM machines.
    Write-Step "Restarting Audiosrv (Windows Audio) ..."
    try {
        Restart-Service -Name 'Audiosrv' -Force -ErrorAction Stop
        Write-Host "    OK" -ForegroundColor Green
    } catch {
        Write-Warning "Failed to restart Audiosrv : $($_.Exception.Message)"
        Write-Warning "  (Are you running PowerShell as Administrator?)"
        exit 1
    }
}

Restart-AudiosrvOnly

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
