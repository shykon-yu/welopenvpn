param(
  [Parameter(Mandatory = $true)]
  [string]$TapctlPath
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $TapctlPath)) {
  exit 0
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

$names = @('WEL TAP', 'WEL Virtual LAN')
for ($i = 2; $i -le 50; $i++) {
  $names += "WEL TAP $i"
}

foreach ($name in $names) {
  & $TapctlPath delete $name | Out-Null
}

Start-Sleep -Seconds 1
Release-WelTapConnectionNames

exit 0
