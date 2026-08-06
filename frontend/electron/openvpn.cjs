const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { inspectVpnNetwork, prioritizeVpnNetwork, waitForVpnNetwork } = require('./network.cjs')

const DEFAULT_HOST = '8.133.189.9'
const DEFAULT_PORT = 1194
const TAP_NAME = 'WEL TAP'
const OPENVPN_READY = /Initialization Sequence Completed/i

let connection = null

function runtimeCandidates() {
  const resources = process.resourcesPath || ''
  return [
    path.join(resources, 'openvpn', 'bin', 'openvpn.exe'),
    path.join(resources, 'openvpn', 'openvpn.exe'),
    'C:\\Program Files\\WEL\\OpenVPN\\bin\\openvpn.exe',
    'C:\\Program Files\\OpenVPN\\bin\\openvpn.exe',
  ]
}

function locateOpenVpn() {
  return runtimeCandidates().find((candidate) => fs.existsSync(candidate)) || null
}

function safeFilePart(value) {
  return String(value || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96)
}

function ensureRuntimeDirectory() {
  const directory = path.join(os.homedir(), 'AppData', 'Local', 'WELOpenVPN', 'runtime')
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

function bundledCaPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'openvpn', 'ca.crt'),
    path.join(__dirname, '..', 'resources', 'openvpn', 'ca.crt'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function buildConfig({ host, port, username, token, roomID, subnetCidr }) {
  const caPath = bundledCaPath()
  if (!caPath) throw new Error('OpenVPN CA 证书未随客户端安装，请重新安装 WEL OpenVPN 客户端')
  const runtime = ensureRuntimeDirectory()
  const prefix = `room-${safeFilePart(roomID)}-${safeFilePart(username)}`
  const authPath = path.join(runtime, `${prefix}.auth`)
  const configPath = path.join(runtime, `${prefix}.ovpn`)
  fs.writeFileSync(authPath, `${username}\r\n${token}\r\n`, { encoding: 'utf8', mode: 0o600 })
  const config = [
    'client',
    'dev tap',
    `dev-node "${TAP_NAME}"`,
    'proto udp4',
    `remote ${host} ${port}`,
    'nobind',
    'persist-key',
    'persist-tun',
    'auth-nocache',
    `auth-user-pass "${authPath}"`,
    `ca "${caPath}"`,
    'remote-cert-tls server',
    'route-nopull',
    'pull-filter ignore redirect-gateway',
    'pull-filter ignore dhcp-option',
    'verb 3',
    `setenv WEL_ROOM_ID ${roomID}`,
    `setenv WEL_SUBNET ${subnetCidr}`,
  ].join('\r\n') + '\r\n'
  fs.writeFileSync(configPath, config, { encoding: 'utf8', mode: 0o600 })
  return { authPath, configPath }
}

function removeFiles(files) {
  for (const file of files || []) {
    try { fs.rmSync(file, { force: true }) } catch { /* temporary credential cleanup */ }
  }
}

function stopConnection() {
  if (!connection) return
  const current = connection
  connection = null
  try { current.process.kill() } catch { /* already stopped */ }
  removeFiles(current.files)
}

function status() {
  const executable = locateOpenVpn()
  const caPath = bundledCaPath()
  const ready = Boolean(executable && caPath)
  return {
    ready,
    openvpnInstalled: Boolean(executable),
    tapName: TAP_NAME,
    message: ready
      ? 'OpenVPN 联机组件已准备好'
      : '未检测到 WEL OpenVPN 联机组件，请重新运行完整安装包并同意管理员授权。',
  }
}

async function connect({ host, port, roomID, username, token, subnetCidr }) {
  const executable = locateOpenVpn()
  if (!executable) throw new Error('未检测到 OpenVPN 运行组件，请重新运行完整安装包')
  if (!token || !username || !roomID || !subnetCidr) throw new Error('OpenVPN 房间凭据不完整')
  stopConnection()

  const files = buildConfig({
    host: host || DEFAULT_HOST,
    port: Number(port) || DEFAULT_PORT,
    username,
    token,
    roomID,
    subnetCidr,
  })
  const child = spawn(executable, ['--config', files.configPath], { windowsHide: true })
  const output = []
  let failed = ''
  let initialized = false
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))
  child.once('error', (error) => { failed = error.message })
  child.once('close', (code) => {
    if (!initialized) failed = `OpenVPN 进程提前退出（代码 ${code ?? '未知'}）`
  })
  connection = { process: child, files: Object.values(files) }

  try {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 30000) {
      if (failed) break
      if (OPENVPN_READY.test(output.join(''))) {
        initialized = true
        const network = await waitForVpnNetwork(subnetCidr, 8000)
        if (!network.connected) throw new Error(`OpenVPN 已连接，但未获取 ${subnetCidr} 的虚拟 IP`)
        return prioritizeVpnNetwork(subnetCidr)
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    throw new Error(`OpenVPN 连接失败：${failed || output.join('').slice(-800) || '连接超时'}`)
  } catch (error) {
    stopConnection()
    throw error
  }
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  TAP_NAME,
  connect,
  status,
  stopConnection,
}
