@echo off
REM ============================================================
REM  Restart Windows audio services to fix the "laptop mat tieng"
REM  bug without rebooting. Double-click this file when sound
REM  stops working in any app.
REM
REM  This wrapper:
REM    1. Auto-elevates to Administrator (UAC prompt appears).
REM    2. Runs scripts/restart-audio.ps1 with execution policy
REM       bypass so Windows doesn't block the unsigned script.
REM    3. Keeps the window open so you can read the output.
REM ============================================================

REM -- Self-elevate to admin if not already --
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

REM -- Locate the PS1 next to this .bat --
set "SCRIPT_DIR=%~dp0"
set "PS1_PATH=%SCRIPT_DIR%restart-audio.ps1"

if not exist "%PS1_PATH%" (
    echo ERROR: Cannot find restart-audio.ps1 next to this batch file.
    echo Expected at: %PS1_PATH%
    pause
    exit /b 1
)

REM -- Run the PowerShell script --
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1_PATH%"

echo.
echo ============================================================
echo Done. Press any key to close this window.
echo ============================================================
pause >nul
