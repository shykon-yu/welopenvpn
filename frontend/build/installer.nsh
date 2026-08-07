!macro customInstall
  SetOutPath "$PLUGINSDIR"
  File /oname=cleanup-openvpn-gui.ps1 "${BUILD_RESOURCES_DIR}\cleanup-openvpn-gui.ps1"
  File /oname=wel-tap-win7.exe "${BUILD_RESOURCES_DIR}\tap-windows-9.24.7-I601-Win7.exe"

  ; OpenVPN runs directly from the application resources directory. Only the
  ; signed TAP-Windows driver is installed into Windows.
  IfFileExists "$INSTDIR\resources\openvpn\bin\openvpn.exe" 0 runtime_missing
  IfFileExists "$INSTDIR\resources\openvpn\bin\tapctl.exe" runtime_ready

runtime_missing:
  MessageBox MB_ICONSTOP|MB_OK "WEL 联机运行文件不完整，请重新下载安装包。"
  Abort

runtime_ready:
  ; Clean startup entries left by older WEL releases that installed the full
  ; OpenVPN feature set. The current helper installs TAP-Windows only.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM openvpn-gui.exe'
  Pop $3
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" 0 cleanup_gui_system32
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup-openvpn-gui.ps1"'
  Pop $4
  Goto cleanup_gui_done
cleanup_gui_system32:
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup-openvpn-gui.ps1"'
  Pop $4
cleanup_gui_done:
  SetShellVarContext all
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  Delete "$SMSTARTUP\OpenVPN GUI.lnk"
  SetRegView 64
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPNGUI"
  SetRegView 32
  SetShellVarContext current
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  Delete "$SMSTARTUP\OpenVPN GUI.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPNGUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPNGUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPNGUI"
  SetRegView lastused
  SetShellVarContext all

  DetailPrint "正在准备 WEL 虚拟网卡..."
  nsExec::ExecToStack '"$SYSDIR\cmd.exe" /D /S /C ""$INSTDIR\resources\openvpn\bin\tapctl.exe" list | "$SYSDIR\findstr.exe" /L /C:"WEL Virtual LAN" /C:"WEL TAP""'
  Pop $2
  Pop $3
  StrCmp $2 "0" tap_ready

  ; Reuse an existing tap0901 driver when possible. This avoids replacing a
  ; working driver owned by another platform and prevents needless prompts.
  nsExec::ExecToLog '"$INSTDIR\resources\openvpn\bin\tapctl.exe" create --hwid "root\tap0901" --name "WEL Virtual LAN"'
  Pop $2
  StrCmp $2 "0" tap_ready
  Goto install_tap_driver

install_tap_driver:
  DetailPrint "正在安装官方 Win7 TAP-Windows 驱动..."
  nsExec::ExecToLog '"$PLUGINSDIR\wel-tap-win7.exe" /S'
  Pop $2
  StrCmp $2 "0" tap_driver_installed
  StrCmp $2 "1641" tap_driver_installed
  StrCmp $2 "3010" tap_driver_installed
  MessageBox MB_ICONSTOP|MB_OK "WEL 虚拟网卡驱动安装失败（错误代码：$2）。请确认 Windows 7 已安装 SP1 和 SHA-2 更新。"
  Abort

tap_driver_installed:
  ; The TAP-only Win7 package can return before Plug and Play has published
  ; the driver. Retry device creation instead of immediately requiring reboot.
  StrCpy $4 0

create_driver_tap:
  Sleep 1000
  nsExec::ExecToLog '"$INSTDIR\resources\openvpn\bin\tapctl.exe" create --hwid "root\tap0901" --name "WEL Virtual LAN"'
  Pop $2
  StrCmp $2 "0" tap_ready
  IntOp $4 $4 + 1
  IntCmp $4 20 tap_requires_reboot create_driver_tap tap_requires_reboot

tap_requires_reboot:
  ; Win7 can delay publishing a newly installed network driver until reboot.
  ; Finish installation and let the elevated app retry tapctl on first launch.
  SetRebootFlag true
  MessageBox MB_ICONEXCLAMATION|MB_OK "TAP-Windows 驱动已安装。Windows 尚未完成虚拟网卡初始化，请安装完成后重启电脑，再启动平台。"

tap_ready:
  DetailPrint "正在配置 WEL 联机防火墙规则..."
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="WEL WE8 Game Broadcast Outbound"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="WEL WE8 Virtual LAN ICMPv4"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="WEL WE8 Virtual LAN ICMPv4" dir=in action=allow protocol=icmpv4:8,any remoteip=10.80.0.0/16 profile=any enable=yes'
  Pop $1
  StrCmp $1 "0" firewall_ready
  MessageBox MB_ICONSTOP|MB_OK "WEL 防火墙规则配置失败（错误代码：$1）。"
  Abort

firewall_ready:
!macroend

!macro customUnInstall
  SetOutPath "$PLUGINSDIR"
  File /oname=cleanup-openvpn-gui.ps1 "${BUILD_RESOURCES_DIR}\cleanup-openvpn-gui.ps1"
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM openvpn-gui.exe'
  Pop $2
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" 0 uninstall_cleanup_gui_system32
  nsExec::ExecToLog '"$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup-openvpn-gui.ps1"'
  Pop $3
  Goto uninstall_cleanup_gui_done
uninstall_cleanup_gui_system32:
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\cleanup-openvpn-gui.ps1"'
  Pop $3
uninstall_cleanup_gui_done:
  ; Keep the dedicated adapter across upgrades and reinstalls. Recreating a
  ; Windows network connection makes Windows append an ever-growing suffix.
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="WEL WE8 Game Broadcast Outbound"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="WEL WE8 Virtual LAN ICMPv4"'
  Pop $0
  SetShellVarContext all
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  Delete "$SMSTARTUP\OpenVPN GUI.lnk"
  SetRegView 64
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPNGUI"
  SetRegView 32
  SetShellVarContext current
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  Delete "$SMSTARTUP\OpenVPN GUI.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPNGUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPNGUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPNGUI"
  SetRegView lastused
!macroend
