# WEL OpenVPN Client

An OpenVPN TAP transport experiment for the WEL WE8 platform. It intentionally
runs alongside the existing SoftEther platform and does not modify or stop
SoftEther services.

## Structure

- `frontend/`: Electron/Vue Windows client based on the existing WEL client.
- `deploy/openvpn/`: six-room Ubuntu OpenVPN TAP server template and JWT lease
  verifier.
- `.github/workflows/`: frontend checks and conditional Windows packaging.

The client continues to use the production Laravel/Go login, room, membership
and heartbeat APIs. OpenVPN authentication sends the current platform JWT to
the room instance; the server verifies that token against the existing active
room lease.

## Current milestone

The application connection lifecycle and server configuration are implemented.
Windows packaging remains intentionally disabled until a verified Win7-
compatible OpenVPN 2.5 runtime, TAP driver, and public server CA certificate
are staged in `frontend/resources/openvpn/`. Private server keys must never be
committed.
