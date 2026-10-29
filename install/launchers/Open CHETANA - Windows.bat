@echo off
rem Opens the CHETANA app (the same as the CHETANA icon on the Desktop).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\install\windows\open.ps1" 
echo.
pause
