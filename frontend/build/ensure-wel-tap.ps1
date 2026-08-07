param(
  [Parameter(Mandatory = $true)]
  [string]$TapctlPath
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $TapctlPath)) {
  exit 2
}

function Release-WelTapConnectionNames {
  $classKey = 'HKLM:\SYSTEM\CurrentControlSet\Control\Network\{4d36e972-e325-11ce-bfc1-08002be10318}'
  Get-ChildItem -LiteralPath $classKey -ErrorAction SilentlyContinue | ForEach-Object {
    $connectionKey = Join-Path $_.PSPath 'Connection'
    $connection = Get-ItemProperty -LiteralPath $connectionKey -ErrorAction SilentlyContinue
    if ($connection.Name -match '^WEL TAP( \d+)?$') {
      Set-ItemProperty -LiteralPath $connectionKey -Name 'Name' -Value ("WEL TAP removed " + $_.PSChildName) -ErrorAction SilentlyContinue
    }
  }
}

function Rename-WelTapAdapter {
  for ($attempt = 1; $attempt -le 10; $attempt++) {
    $adapter = Get-NetAdapter -IncludeHidden -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^WEL TAP( \d+)?$' } |
      Sort-Object { if ($_.Status -eq 'Up') { 0 } else { 1 } }, InterfaceIndex |
      Select-Object -First 1

    if ($null -ne $adapter) {
      if ($adapter.Name -ne 'WEL TAP') {
        Rename-NetAdapter -Name $adapter.Name -NewName 'WEL TAP' -Confirm:$false -ErrorAction SilentlyContinue
      }
      return
    }

    Start-Sleep -Milliseconds 500
  }
}

$names = @('WEL TAP')
for ($i = 2; $i -le 50; $i++) {
  $names += "WEL TAP $i"
}

foreach ($name in $names) {
  & $TapctlPath delete $name | Out-Null
}

Start-Sleep -Seconds 1
Release-WelTapConnectionNames

& $TapctlPath create --hwid 'root\tap0901' --name 'WEL TAP' | Out-Null
$createExitCode = $LASTEXITCODE
if ($createExitCode -eq 0) {
  Rename-WelTapAdapter
}

exit $createExitCode
