param(
  [Parameter(Mandatory = $true)]
  [string]$TapctlPath
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $TapctlPath)) {
  exit 0
}

$statePath = Join-Path $env:ProgramData 'WELPlatform\tap-create.txt'

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

$rememberedGuid = $null
if (Test-Path -LiteralPath $statePath) {
  $stateText = [IO.File]::ReadAllText($statePath)
  $match = [regex]::Match($stateText, '\{[0-9A-Fa-f-]{36}\}')
  if ($match.Success) {
    $rememberedGuid = $match.Value
  }
}

if ($rememberedGuid) {
  & $TapctlPath delete $rememberedGuid | Out-Null
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
Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'WELPlatform\tap-adapter.json') -Force -ErrorAction SilentlyContinue

exit 0
