# WEL OpenVPN Server

This deployment runs six independent OpenVPN TAP broadcast domains. It does
not change or stop SoftEther. A player can use either client, but should not
keep both VPN clients connected at the same time.

## Authentication model

The WEL OpenVPN client logs into the existing platform API, enters a room, and
uses its platform JWT as the OpenVPN password. `verify-lease.sh` calls the
existing `GET /api/v1/me/room-session` endpoint and accepts the connection
only when the JWT owns an unexpired lease for the OpenVPN instance's room.

This avoids a second user database and keeps the existing Laravel platform
permissions, Go sessions, room capacity and heartbeat behavior unchanged.

## Ubuntu setup

1. Install `openvpn`, `curl` and `jq`.
2. Copy this directory to `/etc/welopenvpn` and make `auth/verify-lease.sh`
   and `generate-room-configs.sh` executable.
3. Put the OpenVPN CA certificate, server certificate and server private key
   in `/etc/welopenvpn/pki/` as `ca.crt`, `server.crt`, `server.key`.
4. Copy `welopenvpn.env.example` to `/etc/welopenvpn/welopenvpn.env` and set
   the platform API address.
5. Run `generate-room-configs.sh /etc/welopenvpn/rooms`.
6. Install `systemd/welopenvpn@.service`, then enable instances `1` through
   `6`.
7. Open UDP ports `12001` through `12006` in the cloud firewall and Ubuntu
   firewall. UDP `1194` is already used by the existing SoftEther service.

The client maps room 1 through 6 to UDP `12001` through `12006`. Each room uses
its existing `10.80.<room>.0/24` subnet and does not push a default gateway or
DNS server.

## Release resources

Before packaging the Windows app, put a Win7-compatible OpenVPN 2.5 runtime
and the public `ca.crt` into `frontend/resources/openvpn/`. Never commit the
server private key.
