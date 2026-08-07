!macro customInstall
  SetOutPath "$PLUGINSDIR"
  File /oname=wel-openvpn.msi "${BUILD_RESOURCES_DIR}\OpenVPN-2.5.10-I601-amd64.msi"
  File /oname=ensure-wel-tap.ps1 "${BUILD_RESOURCES_DIR}\ensure-wel-tap.ps1"
  File /oname=remove-wel-tap.ps1 "${BUILD_RESOURCES_DIR}\remove-wel-tap.ps1"

  IfFileExists "$PROGRAMFILES64\OpenVPN\bin\openvpn.exe" 0 install_openvpn
  IfFileExists "$PROGRAMFILES64\OpenVPN\bin\tapctl.exe" openvpn_ready

install_openvpn:
  DetailPrint "正在安装 WEL 联机组件..."
  ; Report one existing TAP adapter so the MSI installs the signed driver but
  ; does not create its own extra adapter. WEL creates the only owned adapter.
  nsExec::ExecToLog '"$SYSDIR\msiexec.exe" /i "$PLUGINSDIR\wel-openvpn.msi" /qn /norestart TAPWINDOWS6ADAPTERS=1'
  Pop $0
  StrCmp $0 "0" openvpn_ready
  MessageBox MB_ICONSTOP|MB_OK "WEL 联机组件安装失败（错误代码：$0），请重新运行安装包并同意管理员授权。"
  Abort

openvpn_ready:
  ; The bundled OpenVPN GUI is not used by WEL. Keep only the WEL shortcuts
  ; and prevent its empty-config warning from appearing after reboot.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM openvpn-gui.exe'
  Pop $3
  SetShellVarContext all
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  Delete "$SMSTARTUP\OpenVPN GUI.lnk"
  SetShellVarContext current
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  Delete "$SMSTARTUP\OpenVPN GUI.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  SetShellVarContext all

  IfFileExists "$PROGRAMFILES64\OpenVPN\bin\tapctl.exe" 0 tapctl_missing
  DetailPrint "正在重置 WEL 虚拟网卡..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\ensure-wel-tap.ps1" -TapctlPath "$PROGRAMFILES64\OpenVPN\bin\tapctl.exe"'
  Pop $2
  StrCmp $2 "0" tap_ready
  MessageBox MB_ICONSTOP|MB_OK "WEL 虚拟网卡重置失败（错误代码：$2）。如果电脑装过其他联机平台，请保留其网卡并重新运行本安装包。"
  Abort

tapctl_missing:
  MessageBox MB_ICONSTOP|MB_OK "WEL 联机组件文件不完整，请重新安装。"
  Abort

tap_ready:
  DetailPrint "正在配置 WEL 联机防火墙规则..."
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
  File /oname=remove-wel-tap.ps1 "${BUILD_RESOURCES_DIR}\remove-wel-tap.ps1"
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM openvpn-gui.exe'
  Pop $2
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\remove-wel-tap.ps1" -TapctlPath "$PROGRAMFILES64\OpenVPN\bin\tapctl.exe"'
  Pop $1
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="WEL WE8 Virtual LAN ICMPv4"'
  Pop $0
  SetShellVarContext all
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  Delete "$SMSTARTUP\OpenVPN GUI.lnk"
  SetShellVarContext current
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  Delete "$SMSTARTUP\OpenVPN GUI.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPN GUI"
  DeleteRegValue HKLM "Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run" "OpenVPN-GUI"
!macroend
