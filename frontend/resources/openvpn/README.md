# WEL OpenVPN Runtime

Release builds bundle the OpenVPN 2.5.10 I601 x64 runtime files directly in
`bin/`. The installer does not register the full OpenVPN MSI, GUI, service or
Wintun driver. It installs only the standalone TAP-Windows driver from
`frontend/build/tap-windows-9.24.6/`.

The public server CA certificate is stored as `ca.crt`. OpenVPN redistribution
terms are included in `LICENSE-OpenVPN.txt`.

Never place server private keys in the repository.
