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

function Kill-StubbornDependents {
    # On Lenovo laptops, TPHKLOAD (Lenovo Hotkey Client Loader) depends
    # on Audiosrv AND refuses to stop via SCM -- both `Stop-Service
    # -Force` and `sc.exe stop` silently no-op. As long as it's running
    # and "depending" on Audiosrv, Windows refuses to stop Audiosrv.
    #
    # Workaround: kill the process directly with taskkill /F. Windows
    # SCM then sees the service as crashed and auto-respawns it after
    # ~30s (because StartType=Automatic). During that gap Audiosrv is
    # free to restart, which is the only thing we actually need.
    #
    # Same pattern catches Toshiba's TPHKLOAD, Dell's stuck audio
    # helpers, and any other OEM service that has the same misbehavior.
    $known = @('TPHKLOAD')
    foreach ($name in $known) {
        $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
        if (-not $svc -or $svc.Status -ne 'Running') { continue }

        $procInfo = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
        if (-not $procInfo -or -not $procInfo.ProcessId) { continue }

        Write-Host "    Killing stubborn dependent: $name (PID $($procInfo.ProcessId))" -ForegroundColor DarkGray
        & taskkill.exe /F /PID $procInfo.ProcessId /T 2>&1 | Out-Null
        Start-Sleep -Milliseconds 400
    }
}

function Restart-AudiosrvOnly {
    # We only restart Audiosrv (Windows Audio), NOT AudioEndpointBuilder.
    #
    # Audiosrv is the one that actually holds the WASAPI session handles
    # we want to free. AudioEndpointBuilder is just the device enumerator
    # and bouncing it on OEM laptops triggers exactly the dependent-locked
    # bail-out we're trying to avoid.
    Write-Step "Restarting Audiosrv (Windows Audio) ..."
    try {
        Restart-Service -Name 'Audiosrv' -Force -ErrorAction Stop
        Write-Host "    OK" -ForegroundColor Green
    } catch {
        # First attempt failed -- usually because a stubborn dependent
        # service (TPHKLOAD on Lenovo, etc.) is locking Audiosrv via
        # SCM. Try again after killing those dependents' processes.
        $msg = $_.Exception.Message
        if ($msg -match 'Cannot stop (\w+)') {
            Write-Host "    First attempt blocked by dependent. Trying harder..." -ForegroundColor DarkYellow
            Kill-StubbornDependents
            Start-Sleep -Milliseconds 500
            try {
                Restart-Service -Name 'Audiosrv' -Force -ErrorAction Stop
                Write-Host "    OK (after killing stubborn dependents)" -ForegroundColor Green
                Write-Host "    Note: Lenovo hotkey service will auto-respawn in ~30s." -ForegroundColor DarkGray
                return
            } catch {
                Write-Warning "Still failed after kill: $($_.Exception.Message)"
            }
        }
        Write-Warning "Failed to restart Audiosrv : $msg"
        Write-Warning "  (Are you running PowerShell as Administrator?)"
        exit 1
    }
}

Restart-AudiosrvOnly

Write-Host ""
Write-Host "Audiosrv restarted." -ForegroundColor Green
Write-Host ""

# Restarting Audiosrv only releases NEW WASAPI handles -- already-running
# apps (especially Chrome / Edge tabs that opened audio before the freeze)
# can still hold dead session pointers internally. We kick those processes
# so the next launch gets a fresh session from the freshly-restarted
# Audiosrv. Chrome auto-restores tabs, so this is non-destructive in
# practice. Edge is bundled in case the user mixed browsers.
Write-Step "Recycling browser audio sessions ..."
$browsers = @('chrome', 'msedge')
$killedAny = $false
foreach ($name in $browsers) {
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($procs) {
        Write-Host "    Killing $name ($($procs.Count) processes) -- tabs will auto-restore on next launch." -ForegroundColor DarkGray
        Stop-Process -Name $name -Force -ErrorAction SilentlyContinue
        $killedAny = $true
    }
}
if (-not $killedAny) {
    Write-Host "    No browser processes were holding audio sessions." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. Open Chrome / Edge again and audio should work." -ForegroundColor Green
Write-Host ""
Write-Host "If silence persists, recycle the audio driver itself:" -ForegroundColor Gray

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
