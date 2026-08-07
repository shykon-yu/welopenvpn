const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { CONNECT_MAX_ATTEMPTS, CONNECT_TIMEOUT_MS, OPENVPN_DATA_CIPHERS, OPENVPN_FALLBACK_CIPHER, OPENVPN_PROGRESS, OPENVPN_REMOTE_CERT_EKU, isWelTapAdapter, isRetryableConnectError, openVpnConfigPath, parseTapctlList, readRecentLog, selectWelTapAdapter } = require('./openvpn.cjs')

test('uses OpenVPN-safe paths in generated config values', () => {
  assert.equal(
    openVpnConfigPath('C:\\Users\\Administrator\\AppData\\Local\\WELPlatform\\runtime\\room.auth'),
    'C:/Users/Administrator/AppData/Local/WELPlatform/runtime/room.auth',
  )
})

test('sends explicit exit notify to shrink stale UDP sessions on reconnect', () => {
  const client = fs.readFileSync(path.join(__dirname, 'openvpn.cjs'), 'utf8')
  assert.match(client, /'explicit-exit-notify 1'/)
})

test('configures the TAP address statically instead of using DHCP emulation', () => {
  const client = fs.readFileSync(path.join(__dirname, 'openvpn.cjs'), 'utf8')
  assert.match(client, /'ip-win32 netsh'/)
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

test('reads the latest openvpn log tail safely', () => {
  const tempPath = path.join(os.tmpdir(), `wel-openvpn-${Date.now()}.log`)
  fs.writeFileSync(tempPath, 'first line\r\nInitialization Sequence Completed\r\n', 'utf8')
  assert.match(readRecentLog(tempPath), /Initialization Sequence Completed/)
  fs.rmSync(tempPath, { force: true })
})

test('detects OpenVPN network configuration progress before final ready line', () => {
  assert.match('PUSH_REPLY,route-gateway 10.80.1.1,ifconfig 10.80.1.10 255.255.255.0', OPENVPN_PROGRESS)
  assert.match('tap-windows6 device [WEL TAP] opened', OPENVPN_PROGRESS)
  assert.doesNotMatch('UDPv4 link remote: [AF_INET]8.133.189.9:12001', OPENVPN_PROGRESS)
})

test('retries transient OpenVPN handshake timeouts only', () => {
  assert.equal(CONNECT_TIMEOUT_MS, 45000)
  assert.equal(CONNECT_MAX_ATTEMPTS, 4)
  assert.equal(isRetryableConnectError(new Error('OpenVPN 连接失败：连接超时：未收到 OpenVPN 初始化完成信号')), true)
  assert.equal(isRetryableConnectError(new Error('OpenVPN 进程提前退出（代码 1）')), false)
})

test('parses and reuses Windows-assigned WEL network connection names', () => {
  const adapters = parseTapctlList([
    '{11111111-2222-3333-4444-555555555555}\tWEL TAP',
    '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}    "WEL TAP 17"',
    'No adapters found.',
  ].join('\r\n'))
  assert.deepEqual(adapters, [
    { guid: '{11111111-2222-3333-4444-555555555555}', name: 'WEL TAP' },
    { guid: '{AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE}', name: 'WEL TAP 17' },
  ])
  assert.equal(isWelTapAdapter('WEL TAP 17'), true)
  assert.equal(isWelTapAdapter('WEL TAP'), true)
  assert.equal(isWelTapAdapter('WEL Virtual LAN'), true)
  assert.equal(isWelTapAdapter('Other TAP 17'), false)
  assert.equal(selectWelTapAdapter(adapters).name, 'WEL TAP')
  assert.equal(selectWelTapAdapter(adapters.slice(1)).name, 'WEL TAP 17')
})

test('keeps and dynamically selects the actual adapter name before connecting', () => {
  const client = fs.readFileSync(path.join(__dirname, 'openvpn.cjs'), 'utf8')
  assert.match(client, /runTapctl\(tapctl, \['create', '--hwid', 'root\\\\tap0901', '--name', TAP_NAME\]/)
  assert.match(client, /runTapctl\(tapctl, \['delete', adapter\.guid\]\)/)
  assert.match(client, /`dev-node "\$\{tapName\}"`/)
  assert.match(client, /newname=\$\{TAP_NAME\}/)
  assert.match(client, /await prepare\(\)/)
})
