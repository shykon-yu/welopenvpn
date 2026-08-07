!macro customInstall
  SetOutPath "$PLUGINSDIR"
  File /oname=wel-openvpn.msi "${BUILD_RESOURCES_DIR}\OpenVPN-2.5.10-I601-amd64.msi"
  File /oname=ensure-wel-tap.ps1 "${BUILD_RESOURCES_DIR}\ensure-wel-tap.ps1"
  File /oname=remove-wel-tap.ps1 "${BUILD_RESOURCES_DIR}\remove-wel-tap.ps1"
  File /oname=cleanup-openvpn-gui.ps1 "${BUILD_RESOURCES_DIR}\cleanup-openvpn-gui.ps1"

  IfFileExists "$PROGRAMFILES64\OpenVPN\bin\openvpn.exe" 0 install_openvpn
  IfFileExists "$PROGRAMFILES64\OpenVPN\bin\tapctl.exe" openvpn_ready

install_openvpn:
  DetailPrint "正在安装 WEL 联机组件..."
  ; Install only the OpenVPN runtime and the layer-2 TAP driver used by WE8.
  ; Leaving Wintun and the OpenVPN GUI out also avoids unused adapters and
  ; startup entries. The MSI creates the first TAP adapter so Windows 7 does
  ; not need an immediate driver-backed delete/recreate cycle.
  nsExec::ExecToLog '"$SYSDIR\msiexec.exe" /i "$PLUGINSDIR\wel-openvpn.msi" /qn /norestart ADDLOCAL=OpenVPN,Drivers,Drivers.TAPWindows6'
  Pop $0
  StrCmp $0 "0" openvpn_ready
  MessageBox MB_ICONSTOP|MB_OK "WEL 联机组件安装失败（错误代码：$0），请重新运行安装包并同意管理员授权。"
  Abort

openvpn_ready:
  ; The bundled OpenVPN GUI is not used by WEL. Keep only the WEL shortcuts
  ; and prevent its empty-config warning from appearing after reboot.
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

  IfFileExists "$PROGRAMFILES64\OpenVPN\bin\tapctl.exe" 0 tapctl_missing
  DetailPrint "正在准备 WEL 虚拟网卡..."
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\ensure-wel-tap.ps1" -TapctlPath "$PROGRAMFILES64\OpenVPN\bin\tapctl.exe"'
  Pop $2
  StrCmp $2 "0" tap_ready
  MessageBox MB_ICONSTOP|MB_OK "WEL 虚拟网卡准备失败（错误代码：$2）。请重新运行安装包并同意驱动安装；Windows 7 还需要系统已安装 SHA-2 驱动签名更新。"
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
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\remove-wel-tap.ps1" -TapctlPath "$PROGRAMFILES64\OpenVPN\bin\tapctl.exe"'
  Pop $1
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
