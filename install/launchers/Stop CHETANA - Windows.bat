@echo off
rem Stops the CHETANA app; the data stays.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\install\windows\stop.ps1" 
echo.
pause
