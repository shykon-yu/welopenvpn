# WEL OpenVPN Runtime

Release builds bundle the OpenVPN 2.5.10 I601 x64 runtime files directly in
`bin/`. The installer invokes the official OpenVPN MSI with only the `Drivers`
and `Drivers.TAPWindows6` features enabled. It does not install OpenVPN GUI,
the OpenVPN service, Wintun or management tools.

The public server CA certificate is stored as `ca.crt`. OpenVPN redistribution
terms are included in `LICENSE-OpenVPN.txt`.

Never place server private keys in the repository.
