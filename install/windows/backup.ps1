# Makes a full copy of the installed app's database in the "backups" folder next to the
# installer. The file holds all customer and money data: keep it safe and copy it to a USB drive.
param([string]$HomeFolder = '')
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $HomeFolder) { $HomeFolder = $PrmApp }
Wait-PrmDocker
if ((Invoke-PrmCompose up -d --wait postgres) -ne 0) { Stop-Prm 'The database did not start.' }
$folder = Join-Path $HomeFolder 'backups'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$file = Join-Path $folder ("chetana-" + (Get-Date -Format 'yyyy-MM-dd-HHmm') + ".dump")
if ((Invoke-PrmCompose exec -T --user postgres postgres sh -c 'umask 077 && pg_dump -U prm_admin -d prm --format=custom --file=/tmp/chetana-backup.dump') -ne 0) { Stop-Prm 'The backup did not work.' }
if ((Invoke-PrmCompose cp postgres:/tmp/chetana-backup.dump $file) -ne 0) { Stop-Prm 'The backup file could not be copied.' }
$null = Invoke-PrmCompose exec -T --user postgres postgres rm -f /tmp/chetana-backup.dump
Write-Host "Backup made: $file"
Write-Host 'Copy it to a USB drive and keep it safe: it holds all customer and money data.'
