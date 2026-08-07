const { runPowerShell } = require('./network.cjs')

const INBOUND_RULE = 'WEL WE8 Game Inbound'
const OUTBOUND_RULE = 'WEL WE8 Game Outbound'
const BROADCAST_OUTBOUND_RULE = 'WEL WE8 Game Broadcast Outbound'

function powerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function buildFirewallVerificationScript(gamePath) {
  return `
$program = ${powerShellLiteral(gamePath)}
$policy = New-Object -ComObject HNetCfg.FwPolicy2
$requiredProfiles = 1 -bor 2 -bor 4

function Test-WelFirewallRule($name, $direction, $expectedRemote) {
  try { $rule = $policy.Rules.Item($name) } catch { return $false }
  if ($null -eq $rule -or -not $rule.Enabled) { return $false }
  if ([int]$rule.Direction -ne $direction -or [int]$rule.Action -ne 1 -or [int]$rule.Protocol -ne 256) { return $false }
  if (([int]$rule.Profiles -band $requiredProfiles) -ne $requiredProfiles) { return $false }
  $actualProgram = ([Environment]::ExpandEnvironmentVariables([string]$rule.ApplicationName)).Trim([char]34)
  if (-not [string]::Equals($actualProgram, $program, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  $remoteAddresses = @(([string]$rule.RemoteAddresses).Split(',') | ForEach-Object { $_.Trim() })
  if ($expectedRemote -eq '10.80.0.0/16') {
    return $remoteAddresses -contains '10.80.0.0/16' -or $remoteAddresses -contains '10.80.0.0/255.255.0.0'
  }
  return $remoteAddresses -contains $expectedRemote -or $remoteAddresses -contains "$expectedRemote/32"
}

if (-not (Test-WelFirewallRule '${INBOUND_RULE}' 1 '10.80.0.0/16')) { exit 41 }
if (-not (Test-WelFirewallRule '${OUTBOUND_RULE}' 2 '10.80.0.0/16')) { exit 42 }
if (-not (Test-WelFirewallRule '${BROADCAST_OUTBOUND_RULE}' 2 '255.255.255.255')) { exit 43 }
`
}

function buildFirewallScript(gamePath) {
  return `
$program = ${powerShellLiteral(gamePath)}
$netsh = Join-Path $env:SystemRoot 'System32\\netsh.exe'

& $netsh advfirewall firewall delete rule "name=${INBOUND_RULE}" | Out-Null
& $netsh advfirewall firewall delete rule "name=${OUTBOUND_RULE}" | Out-Null
& $netsh advfirewall firewall delete rule "name=${BROADCAST_OUTBOUND_RULE}" | Out-Null

& $netsh advfirewall firewall add rule "name=${INBOUND_RULE}" "dir=in" "action=allow" "program=$program" "enable=yes" "profile=any" "remoteip=10.80.0.0/16" "protocol=any" | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $netsh advfirewall firewall add rule "name=${OUTBOUND_RULE}" "dir=out" "action=allow" "program=$program" "enable=yes" "profile=any" "remoteip=10.80.0.0/16" "protocol=any" | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $netsh advfirewall firewall add rule "name=${BROADCAST_OUTBOUND_RULE}" "dir=out" "action=allow" "program=$program" "enable=yes" "profile=any" "remoteip=255.255.255.255" "protocol=any" | Out-Null
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
${buildFirewallVerificationScript(gamePath)}
`
}

async function checkGameFirewall(gamePath) {
  if (process.platform !== 'win32') return true
  try {
    await runPowerShell(buildFirewallVerificationScript(gamePath), 15000)
    return true
  } catch {
    return false
  }
}

async function configureGameFirewall(gamePath) {
  const innerCommand = Buffer.from(buildFirewallScript(gamePath), 'utf16le').toString('base64')
  const elevatedCommand = `
$arguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', '${innerCommand}')
$process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -Wait -PassThru
if ($null -eq $process) { exit 1 }
exit $process.ExitCode
`
  try {
    await runPowerShell(elevatedCommand, 120000)
  } catch {
    throw new Error('WE8 防火墙规则配置失败，请同意管理员授权后重试')
  }
}

module.exports = { buildFirewallScript, buildFirewallVerificationScript, checkGameFirewall, configureGameFirewall, powerShellLiteral }
