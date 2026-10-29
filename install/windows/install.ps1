# Installs (or updates) the V1 app on this Windows computer, inside Docker Desktop.
# Double-click "Install on Windows.bat". It is safe to run again: the data, the passwords, the
# sign-in key and the Owner account are kept; only new program files and new database changes
# are added.
param([string]$HomeFolder = '')
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $HomeFolder) { $HomeFolder = $PrmApp }
$HomeFolder = (Resolve-Path $HomeFolder).Path
Set-Location $PrmApp
# Files from a downloaded zip are marked "from the internet"; mark this folder's files as local.
Get-ChildItem -Path $HomeFolder -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '=== CHETANA Residence Management: install on this Windows computer ===' -ForegroundColor Green
Write-Host ''
Write-Host 'Step 1 of 7: checking Docker Desktop...'
Wait-PrmDocker

Write-Host "Step 2 of 7: reading this computer's network name..."
$name = [System.Net.Dns]::GetHostName().ToLowerInvariant()
if ($name -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$') {
    Stop-Prm "This computer's name '$name' can only use letters, digits and hyphens. Rename it in Settings, System, About, Rename this PC, restart, then run this again."
}
$hostName = "$name.local"
$envText = "# Written by the installer. The app address is https://${hostName}:$PrmPort`nPRM_HOST=$hostName`n"
[System.IO.File]::WriteAllText((Join-Path $PrmInstall '.env'), $envText, (New-Object System.Text.UTF8Encoding $false))
$url = Get-PrmUrl
Write-Host "   The app address will be $url"

Write-Host 'Step 3 of 7: building the app. The first time this takes 5 to 15 minutes...'
if ((Invoke-PrmCompose build) -ne 0) { Stop-Prm 'The build failed. Check the internet connection, then run this again.' }

Write-Host 'Step 4 of 7: starting the database, the database changes and the app...'
if ((Invoke-PrmCompose up -d --wait) -ne 0) { Stop-Prm 'The app did not start. Run this again; if it stops here again, send the last lines of this window.' }

Write-Host 'Step 5 of 7: checking the first Owner account...'
& docker compose -f $PrmCompose run --rm -T tool owner-made *> $null
$status = $LASTEXITCODE
if ($status -eq 3) {
    Write-Host ''
    Write-Host '   Now you make the first Owner account (only once).' -ForegroundColor Yellow
    Write-Host '   Have your phone ready with Google Authenticator, and paper and a pen.'
    Write-Host '   User name: owner'
    Write-Host '   1. Type a password two times (15 to 128 characters). Nothing shows while you type.'
    Write-Host '   2. In Google Authenticator: +, "Enter a setup key", type the key shown here.'
    Write-Host '   3. Type the 6-digit code from the phone.'
    Write-Host '   4. Write the 10 recovery codes on paper.'
    Write-Host '   5. Type: I HAVE STORED THE RECOVERY CODES'
    Write-Host ''
    Read-Host '   Press Enter when you are ready' | Out-Null
    & docker compose -f $PrmCompose run --rm owner-setup --username owner --display-name 'CHETANA Owner' --audit-name chetana-owner
    if ($LASTEXITCODE -ne 0) { Stop-Prm 'The Owner account was not made. Run this again to try again.' }
} elseif ($status -ne 0) {
    Stop-Prm 'The Owner account check did not work. Run this again.'
} else {
    Write-Host '   The Owner account is already there.'
}

Write-Host 'Step 6 of 7: setting up the Property...'
$propertyFile = Join-Path $PrmInstall '.property-name'
$property = ''
if (Test-Path $propertyFile) { $property = (Get-Content $propertyFile -Encoding UTF8 | Select-Object -First 1) }
if (-not $property) {
    $property = Read-Host '   Type the business name and press Enter (just Enter for "CHETANA Residence")'
    if (-not $property) { $property = 'CHETANA Residence' }
}
if ((Invoke-PrmCompose run --rm -T tool setup-property $property) -ne 0) { Stop-Prm 'The Property was not set up. Run this again.' }
[System.IO.File]::WriteAllText($propertyFile, "$property`n", (New-Object System.Text.UTF8Encoding $false))

Write-Host 'Step 7 of 7: the security certificate and the desktop icon...'
$certificate = Join-Path $HomeFolder 'CHETANA certificate.crt'
$tries = 0
do {
    & docker compose -f $PrmCompose cp web:/data/caddy/pki/authorities/local/root.crt $certificate *> $null
    $copied = ($LASTEXITCODE -eq 0)
    if (-not $copied) {
        $tries++
        if ($tries -gt 30) { Stop-Prm 'The certificate was not made. Run this again.' }
        Start-Sleep -Seconds 2
    }
} while (-not $copied)

$thumbprint = (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $certificate).Thumbprint
$trusted = Test-Path "Cert:\LocalMachine\Root\$thumbprint"
$resolves = $true
try { [System.Net.Dns]::GetHostAddresses($hostName) | Out-Null } catch { $resolves = $false }
if (-not $trusted -or -not $resolves) {
    Write-Host '   Windows asks for permission now (Yes), so this computer trusts the app (once).' -ForegroundColor Yellow
    $admin = Join-Path $PSScriptRoot 'admin-steps.ps1'
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$admin`" -Certificate `"$certificate`" -HostName $hostName"
    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList $arguments
    } catch {
        Stop-Prm 'Permission was not given. Run this again and choose Yes.'
    }
    if (-not (Test-Path "Cert:\LocalMachine\Root\$thumbprint")) { Stop-Prm 'The certificate was not trusted. Run this again and choose Yes.' }
} else {
    Write-Host '   This computer already trusts the app certificate.'
}

$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop 'CHETANA.lnk'))
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'open.ps1')`""
$shortcut.WorkingDirectory = $PrmApp
$shortcut.WindowStyle = 7
$shortcut.Description = 'Open CHETANA Residence Management'
$shortcut.Save()

Write-Host ''
Write-Host 'DONE. The app is installed.' -ForegroundColor Green
Write-Host "  - Open it: double-click CHETANA on the Desktop, or go to $url"
Write-Host '  - User name: owner. Use Edge or Chrome.'
Write-Host "  - iPad on the same Wi-Fi: open $url/chetana-certificate.crt once to install the certificate"
Write-Host "    (see READ ME FIRST.txt), then open $url"
Write-Host '  - Keep Docker Desktop set to start when you sign in (Docker Desktop, Settings, General).'
Write-Host ''
Open-PrmBrowser
