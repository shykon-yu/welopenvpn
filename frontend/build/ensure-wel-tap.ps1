param(
  [Parameter(Mandatory = $true)]
  [string]$TapctlPath
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $TapctlPath)) {
  exit 2
}

$names = @('WEL TAP')
for ($i = 2; $i -le 50; $i++) {
  $names += "WEL TAP $i"
}

foreach ($name in $names) {
  & $TapctlPath delete $name | Out-Null
}

& $TapctlPath create --hwid 'root\tap0901' --name 'WEL TAP' | Out-Null
exit $LASTEXITCODE
