param(
  [Parameter(Mandatory = $true)]
  [string]$TapctlPath
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $TapctlPath)) {
  exit 0
}

$names = @('WEL TAP')
for ($i = 2; $i -le 50; $i++) {
  $names += "WEL TAP $i"
}

foreach ($name in $names) {
  & $TapctlPath delete $name | Out-Null
}

exit 0
