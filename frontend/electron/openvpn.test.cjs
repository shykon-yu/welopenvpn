const test = require('node:test')
const assert = require('node:assert/strict')
const { openVpnConfigPath } = require('./openvpn.cjs')

test('uses OpenVPN-safe paths in generated config values', () => {
  assert.equal(
    openVpnConfigPath('C:\\Users\\Administrator\\AppData\\Local\\WELPlatform\\runtime\\room.auth'),
    'C:/Users/Administrator/AppData/Local/WELPlatform/runtime/room.auth',
  )
})
