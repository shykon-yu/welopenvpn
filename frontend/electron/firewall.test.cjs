const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { buildFirewallScript, powerShellLiteral } = require('./firewall.cjs')

const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'App.vue'), 'utf8')

test('escapes apostrophes in PowerShell path literals', () => {
  assert.equal(powerShellLiteral("C:\\Games\\Player's WE8\\WE8.exe"), "'C:\\Games\\Player''s WE8\\WE8.exe'")
})

test('limits game firewall rules to the WEL virtual subnet', () => {
  const script = buildFirewallScript('D:\\实况足球8\\WE8.exe')
  assert.match(script, /WEL WE8 Game Inbound/)
  assert.match(script, /WEL WE8 Game Outbound/)
  assert.match(script, /WEL WE8 Game Broadcast Outbound/)
  assert.match(script, /remoteip=10\.80\.0\.0\/16/)
  assert.match(script, /remoteip=255\.255\.255\.255/)
  assert.match(script, /profile=any/)
  assert.match(script, /program=\$program/)
})

test('reconfigures firewall rules when their revision changes', () => {
  assert.match(appSource, /const FIREWALL_RULE_REVISION = '[1-9][0-9]*'/)
  assert.match(appSource, /const firewallState = `\$\{FIREWALL_RULE_REVISION\}:\$\{path\}`/)
  assert.match(appSource, /localStorage\.getItem\(FIREWALL_GAME_PATH_KEY\) === firewallState/)
  assert.match(appSource, /localStorage\.setItem\(FIREWALL_GAME_PATH_KEY, firewallState\)/)
  assert.doesNotMatch(appSource, /localStorage\.getItem\(FIREWALL_GAME_PATH_KEY\) === path/)
})
