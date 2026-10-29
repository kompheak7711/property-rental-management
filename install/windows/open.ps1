# Opens the installed app: starts Docker Desktop and the app if needed, then the browser.
. (Join-Path $PSScriptRoot 'common.ps1')
$null = Get-PrmUrl
Write-Host 'Starting CHETANA. Please wait...'
Wait-PrmDocker
if ((Invoke-PrmCompose up -d --wait) -ne 0) { Stop-Prm 'The app did not start. Run the installer again.' }
Open-PrmBrowser
