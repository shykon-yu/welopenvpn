param(
  [Parameter(Mandatory = $true)]
  [string]$TapctlPath,
  [Parameter(Mandatory = $true)]
  [string]$TapStatePath
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $TapctlPath)) { exit 0 }

$targets = @()
if (Test-Path -LiteralPath $TapStatePath) {
  Get-Content -LiteralPath $TapStatePath | ForEach-Object {
    $guid = $_.Trim()
    if ($guid -match '^\{[0-9A-Fa-f-]{36}\}$' -and $targets -notcontains $guid) {
      $targets += $guid
    }
  }
}

$list = (& $TapctlPath list 2>&1 | Out-String)
foreach ($line in ($list -split "`r?`n")) {
  if ($line -match '(\{[0-9A-Fa-f-]{36}\}).*?(WEL Virtual LAN(?: \d+)?|WEL TAP(?: \d+)?)\s*$') {
    if ($targets -notcontains $matches[1]) { $targets += $matches[1] }
  }
}

foreach ($target in $targets) {
  & $TapctlPath delete $target | Out-Null
}

Remove-Item -LiteralPath $TapStatePath -Force -ErrorAction SilentlyContinue
exit 0
