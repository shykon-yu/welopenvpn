#!/usr/bin/env bash
set -euo pipefail

output_dir=${1:-/etc/welopenvpn/rooms}
mkdir -p "$output_dir"

for room_id in 1 2 3 4 5 6; do
  subnet="10.80.${room_id}"
  port=$((12000 + room_id))
  cat >"${output_dir}/room-${room_id}.conf" <<EOF
port ${port}
proto udp4
dev tap${room_id}
mode server
topology subnet

ca /etc/welopenvpn/pki/ca.crt
cert /etc/welopenvpn/pki/server.crt
key /etc/welopenvpn/pki/server.key
dh none
ecdh-curve prime256v1
verify-client-cert none
username-as-common-name

# A dedicated layer-2 broadcast domain for this WE8 room. No redirect-gateway
# or DNS options are pushed, so ordinary Internet traffic stays local.
server-bridge ${subnet}.1 255.255.255.0 ${subnet}.10 ${subnet}.109
client-to-client
keepalive 10 60
persist-key
persist-tun
script-security 3
auth-user-pass-verify /etc/welopenvpn/auth/verify-lease.sh via-file

status /var/log/welopenvpn/room-${room_id}.status 30
status-version 2
verb 3
EOF
done
