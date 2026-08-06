# WEL 职业联盟对战平台

An OpenVPN TAP transport for the WEL WE8 platform. This is the active Windows
client line for the platform.

## Structure

- `frontend/`: Electron/Vue Windows client based on the existing WEL client.
- `deploy/openvpn/`: six-room Ubuntu OpenVPN TAP server template and JWT lease
  verifier.
- `.github/workflows/`: frontend checks and conditional Windows packaging.

The client uses the production Laravel/Go login, room, membership and heartbeat
APIs. OpenVPN authentication sends the current platform JWT to the room
instance; the server verifies that token against the active room lease.

## Current milestone

The application connection lifecycle and server configuration are implemented.
Windows packaging uses the official OpenVPN 2.5.10 I601 x64 MSI and the public
server CA certificate. The WEL installer silently installs the shared OpenVPN
runtime when absent, then creates only the dedicated `WEL TAP` adapter. Private
server keys are never committed.
