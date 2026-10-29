@echo off
rem Installs or updates the CHETANA app on this computer (install/windows/install.ps1).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\install\windows\install.ps1" -HomeFolder "%~dp0."
echo.
pause
