const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const installer = fs.readFileSync(path.join(__dirname, '..', 'build', 'installer.nsh'), 'utf8')

test('installs the TAP driver without creating an extra MSI-owned adapter', () => {
  assert.match(installer, /TAPWINDOWS6ADAPTERS=1/)
  assert.match(installer, /create --hwid root\\tap0901 --name "WEL TAP"/)
})

test('runs installer system commands without visible console windows', () => {
  assert.doesNotMatch(installer, /ExecWait/)
  assert.match(installer, /nsExec::ExecToLog[^\n]+netsh\.exe/)
  assert.match(installer, /nsExec::ExecToLog[^\n]+tapctl\.exe/)
})
