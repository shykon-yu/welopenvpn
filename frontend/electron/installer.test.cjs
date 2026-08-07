const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const installer = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8')
const cleanupOpenVpnGui = fs.readFileSync(path.join(__dirname, '..', 'build', 'cleanup-openvpn-gui.ps1'), 'utf8')

test('bundles the OpenVPN runtime and installs only the official Win7 TAP package', () => {
  assert.doesNotMatch(installer, /msiexec\.exe/)
  assert.doesNotMatch(installer, /\.msi/)
  assert.match(installer, /tap-windows-9\.24\.7-I601-Win7\.exe/)
  assert.match(installer, /wel-tap-win7\.exe" \/S/)
  assert.doesNotMatch(installer, /Drivers\.Wintun|OpenVPN GUI.*ADDLOCAL/)
  assert.match(installer, /resources\\openvpn\\bin\\openvpn\.exe/)
  assert.match(installer, /tapctl\.exe" create --hwid "root\\tap0901" --name "WEL Virtual LAN"/)
  assert.doesNotMatch(installer, /ensure-wel-tap\.ps1|remove-wel-tap\.ps1/)
})

test('reuses the dedicated adapter across upgrades without recreating it', () => {
  assert.match(installer, /tapctl\.exe" list .*findstr\.exe" \/L \/C:"WEL Virtual LAN" \/C:"WEL TAP"/)
  assert.doesNotMatch(installer, /wel-tapctl\.exe" delete|uninstall_wel_tap_loop/)
  assert.match(installer, /Keep the dedicated adapter across upgrades and reinstalls/)
  assert.doesNotMatch(installer, /Win32_NetworkAdapter|Get-NetAdapter/)
})

test('lets Win7 finish installation when a newly installed driver needs reboot', () => {
  assert.match(installer, /SetRebootFlag true/)
  assert.match(installer, /Windows 尚未完成虚拟网卡初始化/)
  assert.doesNotMatch(installer, /WEL 虚拟网卡创建失败.*Abort/s)
})

test('runs installer system commands without visible console windows', () => {
  assert.doesNotMatch(installer, /ExecWait/)
  assert.match(installer, /nsExec::ExecToLog[^\n]+netsh\.exe/)
  assert.match(installer, /nsExec::ExecToLog[^\n]+powershell\.exe/)
})

test('removes unused OpenVPN GUI shortcuts and startup entries', () => {
  assert.match(installer, /cleanup-openvpn-gui\.ps1/)
  assert.match(installer, /\$SMSTARTUP\\OpenVPN GUI\.lnk/)
  assert.match(installer, /DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "OpenVPN GUI"/)
  assert.match(installer, /DeleteRegValue HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "OpenVPN GUI"/)
  assert.match(installer, /DeleteRegValue HKLM "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run" "OpenVPN GUI"/)
  assert.match(installer, /taskkill\.exe" \/F \/IM openvpn-gui\.exe/)
  assert.match(cleanupOpenVpnGui, /CommonStartup/)
  assert.match(cleanupOpenVpnGui, /Remove-ItemProperty/)
  assert.match(cleanupOpenVpnGui, /Get-ScheduledTask/)
  assert.match(cleanupOpenVpnGui, /Unregister-ScheduledTask/)
  assert.match(installer, /Sysnative\\WindowsPowerShell/)
  assert.match(installer, /SetRegView 64/)
  assert.match(installer, /SetRegView 32/)
})
