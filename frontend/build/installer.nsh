!macro customInstall
  SetOutPath "$PLUGINSDIR"
  File /oname=ensure-wel-tap.ps1 "${BUILD_RESOURCES_DIR}\ensure-wel-tap.ps1"
  File /oname=remove-wel-tap.ps1 "${BUILD_RESOURCES_DIR}\remove-wel-tap.ps1"
  File /oname=cleanup-openvpn-gui.ps1 "${BUILD_RESOURCES_DIR}\cleanup-openvpn-gui.ps1"
  File /oname=wel-tap.msi "${BUILD_RESOURCES_DIR}\OpenVPN-2.5.10-I601-amd64.msi"

  ; OpenVPN runs directly from the application resources directory. Only the
  ; signed TAP-Windows driver is installed into Windows.
  IfFileExists "$INSTDIR\resources\openvpn\bin\openvpn.exe" 0 runtime_missing
  IfFileExists "$INSTDIR\resources\openvpn\bin\tapctl.exe" runtime_ready

runtime_missing:
  MessageBox MB_ICONSTOP|MB_OK "WEL 联机运行文件不完整，请重新下载安装包。"
  Abort

runtime_ready:
  ; Clean startup entries left by older WEL releases that installed the full
  ; OpenVPN feature set. The current MSI invocation installs TAP only.
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
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\ensure-wel-tap.ps1" -TapctlPath "$INSTDIR\resources\openvpn\bin\tapctl.exe"'
  Pop $2
  StrCmp $2 "0" tap_ready

  DetailPrint "正在安装官方 TAP-Windows 驱动..."
  nsExec::ExecToLog '"$SYSDIR\msiexec.exe" /i "$PLUGINSDIR\wel-tap.msi" /qn /norestart ADDLOCAL=Drivers,Drivers.TAPWindows6 /L*v "$TEMP\WEL-TAP-install.log"'
  Pop $2
  StrCmp $2 "0" tap_driver_installed
  StrCmp $2 "1641" tap_driver_installed
  StrCmp $2 "3010" tap_driver_installed
  MessageBox MB_ICONSTOP|MB_OK "WEL 虚拟网卡驱动安装失败（错误代码：$2）。请确认 Windows 7 已安装 SP1 和 SHA-2 更新。安装日志：$TEMP\WEL-TAP-install.log"
  Abort

tap_driver_installed:
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\ensure-wel-tap.ps1" -TapctlPath "$INSTDIR\resources\openvpn\bin\tapctl.exe"'
  Pop $2
  StrCmp $2 "0" tap_ready
  MessageBox MB_ICONSTOP|MB_OK "TAP-Windows 驱动已安装，但 WEL 虚拟网卡创建失败（错误代码：$2）。请重启电脑后重新运行安装包。安装日志：$TEMP\WEL-TAP-install.log"
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
  File /oname=wel-tapctl.exe "${BUILD_RESOURCES_DIR}\..\resources\openvpn\bin\tapctl.exe"
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
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\remove-wel-tap.ps1" -TapctlPath "$PLUGINSDIR\wel-tapctl.exe"'
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
