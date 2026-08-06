# WEL OpenVPN Runtime

Release builds must place a Win7-compatible OpenVPN 2.5 runtime and the public
server CA certificate in this directory before packaging. The Electron client
expects `bin/openvpn.exe`, `bin/tapctl.exe`, `driver/OemVista.inf` with its
signed driver files, and `ca.crt` under the installed `resources/openvpn`
directory.

Do not place private keys or a shared `tls-crypt` key in the repository.
