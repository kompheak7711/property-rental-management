# Shared lines of the Windows scripts of the installed V1 app (install/compose.yaml). Paths only.
# Windows PowerShell 5.1 (built into Windows 10 and 11). Errors of "docker" are checked by exit
# code: in PowerShell 5.1 a redirected native error line would otherwise stop the script.
$ErrorActionPreference = 'Continue'
$PrmInstall = Split-Path -Parent $PSScriptRoot
$PrmApp = Split-Path -Parent $PrmInstall
$PrmCompose = Join-Path $PrmInstall 'compose.yaml'
$PrmPort = 8443

function Stop-Prm([string]$Message) {
    Write-Host ''
    Write-Host "STOPPED: $Message" -ForegroundColor Red
    exit 1
}

# Runs "docker compose" with this app's file; shows its output and returns only its exit code.
function Invoke-PrmCompose {
    & docker compose -f $PrmCompose @args | Out-Host
    return $LASTEXITCODE
}

function Get-PrmUrl {
    $envFile = Join-Path $PrmInstall '.env'
    if (-not (Test-Path $envFile)) { Stop-Prm 'The app is not installed yet. Double-click the installer first.' }
    $line = Get-Content $envFile | Where-Object { $_ -like 'PRM_HOST=*' } | Select-Object -First 1
    if (-not $line) { Stop-Prm 'The app is not installed yet. Double-click the installer first.' }
    return "https://$($line.Substring(9)):$PrmPort"
}

# Starts Docker Desktop when it is not running, and waits for it (at most 3 minutes).
function Wait-PrmDocker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host 'Docker Desktop is not installed. The download page opens now.'
        Write-Host 'Install Docker Desktop for Windows, restart the computer, open Docker Desktop once,'
        Write-Host 'then run this again.'
        Start-Process 'https://www.docker.com/products/docker-desktop/'
        Stop-Prm 'Docker Desktop is needed.'
    }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Opening Docker Desktop. Please wait...'
        $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (Test-Path $desktop) { Start-Process $desktop }
        $tries = 0
        do {
            Start-Sleep -Seconds 2
            $tries++
            if ($tries -gt 90) { Stop-Prm 'Docker Desktop did not start in 3 minutes. Open it, then try again.' }
            & docker info *> $null
        } while ($LASTEXITCODE -ne 0)
    }
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { Stop-Prm "This Docker has no 'docker compose'. Update Docker Desktop." }
}

# Waits until the screens answer on port 8443 (about 1 minute at most), then opens the browser.
function Open-PrmBrowser {
    $url = Get-PrmUrl
    for ($i = 0; $i -lt 60; $i++) {
        $client = New-Object System.Net.Sockets.TcpClient
        try { $client.Connect('127.0.0.1', $PrmPort); $client.Close(); break } catch { Start-Sleep -Seconds 1 }
    }
    Start-Process $url
    Write-Host "The app is at $url"
}
