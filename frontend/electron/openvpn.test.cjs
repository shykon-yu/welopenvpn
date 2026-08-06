const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { OPENVPN_DATA_CIPHERS, OPENVPN_FALLBACK_CIPHER, OPENVPN_REMOTE_CERT_EKU, openVpnConfigPath } = require('./openvpn.cjs')

test('uses OpenVPN-safe paths in generated config values', () => {
  assert.equal(
    openVpnConfigPath('C:\\Users\\Administrator\\AppData\\Local\\WELPlatform\\runtime\\room.auth'),
    'C:/Users/Administrator/AppData/Local/WELPlatform/runtime/room.auth',
  )
})

test('keeps client and server cipher settings aligned', () => {
  const generator = fs.readFileSync(path.join(__dirname, '..', '..', 'deploy', 'openvpn', 'generate-room-configs.sh'), 'utf8')
  assert.match(generator, new RegExp(`data-ciphers ${OPENVPN_DATA_CIPHERS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  assert.match(generator, new RegExp(`data-ciphers-fallback ${OPENVPN_FALLBACK_CIPHER}`))
  assert.match(generator, new RegExp(`cipher ${OPENVPN_FALLBACK_CIPHER}`))
  assert.match(generator, /setenv WEL_ROOM_ID \$\{room_id\}/)
  assert.match(generator, /setenv WEL_API_BASE_URL \$\{api_base\}/)
})

test('checks server certificate EKU without requiring missing key usage extension', () => {
  const client = fs.readFileSync(path.join(__dirname, 'openvpn.cjs'), 'utf8')
  assert.match(client, new RegExp(`remote-cert-eku "\\$\\{OPENVPN_REMOTE_CERT_EKU\\}"`))
  assert.equal(OPENVPN_REMOTE_CERT_EKU, 'TLS Web Server Authentication')
  assert.doesNotMatch(client, /remote-cert-tls server/)
})
