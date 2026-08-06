!macro customInstall
  DetailPrint "正在安装 WEL TAP 虚拟网卡驱动..."
  ExecWait '"$SYSDIR\pnputil.exe" /add-driver "$INSTDIR\resources\openvpn\driver\OemVista.inf" /install' $0
  ExecWait '"$INSTDIR\resources\openvpn\bin\tapctl.exe" delete "WEL TAP"' $1
  ExecWait '"$INSTDIR\resources\openvpn\bin\tapctl.exe" create --name "WEL TAP"' $2

  DetailPrint "正在写入 WEL OpenVPN 联机防火墙规则..."
  ExecWait 'netsh advfirewall firewall delete rule name="WEL WE8 Virtual LAN ICMPv4"' $0
  ExecWait 'netsh advfirewall firewall add rule name="WEL WE8 Virtual LAN ICMPv4" dir=in action=allow protocol=icmpv4:8,any remoteip=10.80.0.0/16 profile=any enable=yes' $1
!macroend

!macro customUnInstall
  ExecWait '"$INSTDIR\resources\openvpn\bin\tapctl.exe" delete "WEL TAP"' $1
  ExecWait 'netsh advfirewall firewall delete rule name="WEL WE8 Virtual LAN ICMPv4"' $0
!macroend
