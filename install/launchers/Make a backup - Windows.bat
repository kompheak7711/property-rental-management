@echo off
rem Makes a full database backup in the backups folder.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\install\windows\backup.ps1" -HomeFolder "%~dp0."
echo.
pause
