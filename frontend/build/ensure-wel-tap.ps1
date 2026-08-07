param(
  [Parameter(Mandatory = $true)]
  [string]$TapctlPath
)

$ErrorActionPreference = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $TapctlPath)) {
  exit 2
}

function Get-TapAdapters {
  @(Get-WmiObject -Class Win32_NetworkAdapter -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ServiceName -eq 'tap0901' -or
      $_.PNPDeviceID -match 'TAP0901'
    })
}

function Set-TapConnectionName {
  param(
    [Parameter(Mandatory = $true)]
    $Adapter,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ([string]::IsNullOrEmpty($Adapter.GUID)) {
    return $false
  }

  $adapterGuid = $Adapter.GUID.Trim('{}')
  $connectionKey = "HKLM:\SYSTEM\CurrentControlSet\Control\Network\{4d36e972-e325-11ce-bfc1-08002be10318}\{$adapterGuid}\Connection"
  if (-not (Test-Path -LiteralPath $connectionKey)) {
    return $false
  }

  Set-ItemProperty -LiteralPath $connectionKey -Name 'Name' -Value $Name -ErrorAction SilentlyContinue
  $connection = Get-ItemProperty -LiteralPath $connectionKey -ErrorAction SilentlyContinue
  return $null -ne $connection -and $connection.Name -eq $Name
}

function Remove-NumberedWelTapAdapters {
  Get-TapAdapters |
    Where-Object { $_.NetConnectionID -match '^WEL TAP \d+$' } |
    ForEach-Object {
      if (-not [string]::IsNullOrEmpty($_.GUID)) {
        & $TapctlPath delete $_.GUID | Out-Null
      }
    }
}

# Keep the owned adapter across upgrades. Recreating it on every install is
# unnecessary and is unreliable on Windows 7 immediately after driver setup.
$welTap = Get-TapAdapters |
  Where-Object { $_.NetConnectionID -eq 'WEL TAP' } |
  Select-Object -First 1

if ($null -ne $welTap) {
  Remove-NumberedWelTapAdapters
  exit 0
}

Remove-NumberedWelTapAdapters
Start-Sleep -Milliseconds 500

$tapAdapters = @(Get-TapAdapters)
$officialAdapter = $tapAdapters |
  Where-Object { $_.NetConnectionID -match '^OpenVPN TAP-Windows6( \d+)?$' } |
  Select-Object -First 1

# A fresh TAP-only MSI install creates this adapter. On Windows 7, adopting it
# is more reliable than deleting it and asking SetupAPI to create it again.
if ($null -ne $officialAdapter -and (Set-TapConnectionName -Adapter $officialAdapter -Name 'WEL TAP')) {
  exit 0
}

# If this is the only TAP adapter on the machine, it belongs to this clean
# install even when Windows assigned a localized connection name.
if ($tapAdapters.Count -eq 1 -and (Set-TapConnectionName -Adapter $tapAdapters[0] -Name 'WEL TAP')) {
  exit 0
}

& $TapctlPath create --hwid 'root\tap0901' --name 'WEL TAP' | Out-Null
$createExitCode = $LASTEXITCODE

if ($createExitCode -ne 0) {
  $createdAdapter = Get-TapAdapters |
    Where-Object { $_.NetConnectionID -eq 'WEL TAP' } |
    Select-Object -First 1
  if ($null -ne $createdAdapter) {
    exit 0
  }
}

exit $createExitCode
