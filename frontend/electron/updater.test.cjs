const test = require('node:test')
const assert = require('node:assert/strict')
const { compareVersions, GITHUB_UPDATE_URL, SERVER_UPDATE_URL } = require('./updater.cjs')
const main = require('node:fs').readFileSync(require('node:path').join(__dirname, 'main.cjs'), 'utf8')

test('compares semantic client versions', () => {
  assert.equal(compareVersions('0.1.26', '0.1.25'), 1)
  assert.equal(compareVersions('v0.1.25', '0.1.25'), 0)
  assert.equal(compareVersions('0.1.24', '0.1.25'), -1)
  assert.equal(compareVersions('0.1.25.1', '0.1.25'), 1)
})

test('uses github as the primary update source and server as fallback', () => {
  assert.match(GITHUB_UPDATE_URL, /github\.com\/shykon-yu\/welopenvpn\/releases\/download\/windows-client-latest\/latest\.json/)
  assert.match(SERVER_UPDATE_URL, /8\.133\.189\.9:1421\/downloads\/welopenvpn\/latest\.json/)
})

test('wires update checks into the app menu and startup', () => {
  assert.match(main, /label: '检查更新'/)
  assert.match(main, /checkForUpdates\(true\)/)
  assert.match(main, /checkForUpdates\(false\)/)
  assert.match(main, /downloadInstaller\(info/)
})
