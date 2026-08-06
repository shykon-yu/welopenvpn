!macro customInstall
  IfFileExists "$PROGRAMFILES64\OpenVPN\bin\openvpn.exe" openvpn_ready

  DetailPrint "正在安装 OpenVPN 2.5 联机组件..."
  SetOutPath "$PLUGINSDIR"
  File /oname=wel-openvpn.msi "${BUILD_RESOURCES_DIR}\OpenVPN-2.5.10-I601-amd64.msi"
  ExecWait '"$SYSDIR\msiexec.exe" /i "$PLUGINSDIR\wel-openvpn.msi" /qn /norestart' $0

openvpn_ready:
  ; The bundled OpenVPN GUI is not used by WEL. Keep only the WEL shortcuts.
  SetShellVarContext all
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  SetShellVarContext current
  Delete "$DESKTOP\OpenVPN GUI.lnk"
  Delete "$SMPROGRAMS\OpenVPN\OpenVPN GUI.lnk"
  SetShellVarContext all

  DetailPrint "正在创建 WEL TAP 虚拟网卡..."
  ExecWait '"$PROGRAMFILES64\OpenVPN\bin\tapctl.exe" delete "WEL TAP"' $1
  ExecWait '"$PROGRAMFILES64\OpenVPN\bin\tapctl.exe" create --name "WEL TAP"' $2

  DetailPrint "正在写入 WEL OpenVPN 联机防火墙规则..."
  ExecWait 'netsh advfirewall firewall delete rule name="WEL WE8 Virtual LAN ICMPv4"' $0
  ExecWait 'netsh advfirewall firewall add rule name="WEL WE8 Virtual LAN ICMPv4" dir=in action=allow protocol=icmpv4:8,any remoteip=10.80.0.0/16 profile=any enable=yes' $1
!macroend

!macro customUnInstall
  ExecWait '"$PROGRAMFILES64\OpenVPN\bin\tapctl.exe" delete "WEL TAP"' $1
  ExecWait 'netsh advfirewall firewall delete rule name="WEL WE8 Virtual LAN ICMPv4"' $0
!macroend
