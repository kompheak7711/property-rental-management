# The two steps of the Windows install that need administrator permission (install.ps1 asks
# Windows for it): trust the app's own certificate authority, and, only when this computer cannot
# find its own NAME.local address, add that one name to the hosts file.
param(
    [Parameter(Mandatory = $true)][string]$Certificate,
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.local$')][string]$HostName
)
$ErrorActionPreference = 'Stop'
Import-Certificate -FilePath $Certificate -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null

$resolves = $true
try { [System.Net.Dns]::GetHostAddresses($HostName) | Out-Null } catch { $resolves = $false }
if (-not $resolves) {
    $hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
    $pattern = '^\s*127\.0\.0\.1\s+' + [regex]::Escape($HostName) + '(\s|$)'
    if (-not (Select-String -Path $hosts -Pattern $pattern -Quiet)) {
        Add-Content -Path $hosts -Value "`r`n127.0.0.1 $HostName # CHETANA app on this computer" -Encoding ASCII
    }
}
