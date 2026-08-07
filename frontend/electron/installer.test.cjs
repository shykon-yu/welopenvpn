const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const installer = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8')
const ensureTap = fs.readFileSync(path.join(__dirname, '..', 'build', 'ensure-wel-tap.ps1'), 'utf8')
const removeTap = fs.readFileSync(path.join(__dirname, '..', 'build', 'remove-wel-tap.ps1'), 'utf8')

test('installs the TAP driver without creating an extra MSI-owned adapter', () => {
  assert.match(installer, /TAPWINDOWS6ADAPTERS=1/)
  assert.match(installer, /ensure-wel-tap\.ps1/)
  assert.match(ensureTap, /create --hwid 'root\\tap0901' --name 'WEL TAP'/)
})

test('resets numbered WEL TAP adapters during install and uninstall', () => {
  assert.match(ensureTap, /for \(\$i = 2; \$i -le 50; \$i\+\+\)/)
  assert.match(ensureTap, /& \$TapctlPath delete \$name/)
  assert.match(removeTap, /for \(\$i = 2; \$i -le 50; \$i\+\+\)/)
  assert.match(removeTap, /& \$TapctlPath delete \$name/)
})

test('keeps the Windows network connection name pinned to WEL TAP', () => {
  assert.match(ensureTap, /Release-WelTapConnectionNames/)
  assert.match(ensureTap, /Rename-NetAdapter -Name \$adapter\.Name -NewName 'WEL TAP'/)
  assert.match(ensureTap, /Set-ItemProperty -LiteralPath \$connectionKey -Name 'Name'/)
  assert.match(ensureTap, /\^WEL TAP\( \\d\+\)\?\$/)
  assert.match(removeTap, /Release-WelTapConnectionNames/)
})

test('runs installer system commands without visible console windows', () => {
  assert.doesNotMatch(installer, /ExecWait/)
  assert.match(installer, /nsExec::ExecToLog[^\n]+netsh\.exe/)
  assert.match(installer, /nsExec::ExecToLog[^\n]+powershell\.exe/)
})

test('removes unused OpenVPN GUI shortcuts and startup entries', () => {
  assert.match(installer, /\$SMSTARTUP\\OpenVPN GUI\.lnk/)
  assert.match(installer, /DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "OpenVPN GUI"/)
  assert.match(installer, /DeleteRegValue HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "OpenVPN GUI"/)
  assert.match(installer, /DeleteRegValue HKLM "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run" "OpenVPN GUI"/)
  assert.match(installer, /taskkill\.exe" \/F \/IM openvpn-gui\.exe/)
})
