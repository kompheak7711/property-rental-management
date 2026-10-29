# Stops the installed app. The data stays; the CHETANA icon starts it again.
. (Join-Path $PSScriptRoot 'common.ps1')
Wait-PrmDocker
if ((Invoke-PrmCompose stop) -ne 0) { Stop-Prm 'The app did not stop.' }
Write-Host 'CHETANA is stopped. Double-click CHETANA on the Desktop to start it again.'
