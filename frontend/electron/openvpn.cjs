const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { prioritizeVpnNetwork, runPowerShell, waitForVpnNetwork } = require('./network.cjs')

const DEFAULT_HOST = '8.133.189.9'
const DEFAULT_PORT = 12001
const TAP_NAME = 'WEL TAP'
const OPENVPN_READY = /Initialization Sequence Completed/i
const OPENVPN_PROGRESS = /(?:PUSH_REPLY|open_tun|tap-windows6 device \[.+?\] opened|Successful ARP Flush)/i
const CONNECT_TIMEOUT_MS = 45000
const CONNECT_MAX_ATTEMPTS = 4
const OPENVPN_DATA_CIPHERS = 'AES-256-GCM:AES-128-GCM:AES-256-CBC'
const OPENVPN_FALLBACK_CIPHER = 'AES-256-CBC'
const OPENVPN_REMOTE_CERT_EKU = 'TLS Web Server Authentication'
const LOG_DIRECTORY = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'WELPlatform', 'logs')
const MANAGEMENT_HOST = '127.0.0.1'
const MANAGEMENT_STOP_TIMEOUT_MS = 3000

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
  const directory = path.join(os.homedir(), 'AppData', 'Local', 'WELPlatform', 'runtime')
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

function ensureLogDirectory() {
  fs.mkdirSync(LOG_DIRECTORY, { recursive: true })
  return LOG_DIRECTORY
}

function recentOutput(output, limit = 2000) {
  return output.join('').replace(/\r?\n/g, '\n').trim().slice(-limit)
}

function readRecentLog(filePath, limit = 2000) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').replace(/\r?\n/g, '\n').trim().slice(-limit) : ''
  } catch {
    return ''
  }
}

function openVpnConfigPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/')
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
  if (!caPath) throw new Error('联机证书未随客户端安装，请重新安装 WEL职业联盟对战平台')
  const runtime = ensureRuntimeDirectory()
  const prefix = `room-${safeFilePart(roomID)}-${safeFilePart(username)}`
  const authPath = path.join(runtime, `${prefix}.auth`)
  const configPath = path.join(runtime, `${prefix}.ovpn`)
  const logPath = path.join(ensureLogDirectory(), `${prefix}.openvpn.log`)
  const managementPort = 25000 + (Number(roomID) % 1000)
  fs.writeFileSync(authPath, `${username}\r\n${token}\r\n`, { encoding: 'utf8', mode: 0o600 })
  fs.writeFileSync(logPath, '', { encoding: 'utf8' })
  const config = [
    'client',
    'dev tap',
    `dev-node "${TAP_NAME}"`,
    'proto udp4',
    'explicit-exit-notify 1',
    `remote ${host} ${port}`,
    `management ${MANAGEMENT_HOST} ${managementPort}`,
    'nobind',
    'persist-key',
    'persist-tun',
    'auth-nocache',
    `auth-user-pass "${openVpnConfigPath(authPath)}"`,
    `ca "${openVpnConfigPath(caPath)}"`,
    `remote-cert-eku "${OPENVPN_REMOTE_CERT_EKU}"`,
    `data-ciphers ${OPENVPN_DATA_CIPHERS}`,
    `data-ciphers-fallback ${OPENVPN_FALLBACK_CIPHER}`,
    `cipher ${OPENVPN_FALLBACK_CIPHER}`,
    'route-nopull',
    'pull-filter ignore redirect-gateway',
    'pull-filter ignore dhcp-option',
    'verb 3',
    `log "${openVpnConfigPath(logPath)}"`,
    `setenv WEL_ROOM_ID ${roomID}`,
    `setenv WEL_SUBNET ${subnetCidr}`,
  ].join('\r\n') + '\r\n'
  fs.writeFileSync(configPath, config, { encoding: 'utf8', mode: 0o600 })
  return { authPath, configPath, logPath, managementPort }
}

function removeFiles(files) {
  for (const file of files || []) {
    try { fs.rmSync(file, { force: true }) } catch { /* temporary credential cleanup */ }
  }
}

function waitForProcessExit(process, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    process.once('close', () => {
      clearTimeout(timer)
      finish(true)
    })
  })
}

function sendManagementSignal(port, command) {
  return new Promise((resolve, reject) => {
    const net = require('node:net')
    const socket = net.createConnection({ host: MANAGEMENT_HOST, port }, () => {
      socket.write(`${command}\n`)
      socket.end()
    })
    socket.setTimeout(1500)
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('management timeout'))
    })
    socket.once('error', reject)
    socket.once('close', () => resolve())
  })
}

async function stopConnection() {
  if (!connection) return
  const current = connection
  connection = null
  try {
    if (current.managementPort) {
      await sendManagementSignal(current.managementPort, 'signal SIGTERM')
      const exited = await waitForProcessExit(current.process, MANAGEMENT_STOP_TIMEOUT_MS)
      if (!exited) {
        try { current.process.kill() } catch {}
      }
    } else {
      try { current.process.kill() } catch {}
    }
  } finally {
    removeFiles(current.temporaryFiles)
  }
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
      ? '联机组件已准备好'
      : '未检测到 WEL 联机组件，请重新运行完整安装包并同意管理员授权。',
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableConnectError(error) {
  return /连接超时：未收到 OpenVPN 初始化完成信号/.test(String(error?.message || error || ''))
}

async function stopStaleWelOpenVpnProcesses() {
  if (process.platform !== 'win32') return
  try {
    await runPowerShell(`
Get-WmiObject Win32_Process -Filter "Name = 'openvpn.exe'" |
  Where-Object { $_.CommandLine -like '*WELPlatform*' } |
  ForEach-Object { try { $_.Terminate() | Out-Null } catch {} }
`, 5000)
  } catch {
    // Best effort only. A normal connection attempt can still proceed.
  }
}

async function connectAttempt({ executable, host, port, roomID, username, token, subnetCidr }) {
  await stopConnection()
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
  connection = { process: child, temporaryFiles: [files.authPath, files.configPath], logPath: files.logPath, managementPort: files.managementPort }

  try {
    const startedAt = Date.now()
    while (Date.now() - startedAt < CONNECT_TIMEOUT_MS) {
      if (failed) break
      const liveOutput = recentOutput(output)
      const fileOutput = readRecentLog(files.logPath)
      if (OPENVPN_READY.test(liveOutput) || OPENVPN_READY.test(fileOutput)) {
        initialized = true
        const network = await waitForVpnNetwork(subnetCidr, 8000)
        if (!network.connected) throw new Error(`OpenVPN 已连接，但未获取 ${subnetCidr} 的虚拟 IP`)
        return prioritizeVpnNetwork(subnetCidr)
      }
      if (OPENVPN_PROGRESS.test(liveOutput) || OPENVPN_PROGRESS.test(fileOutput)) {
        const network = await waitForVpnNetwork(subnetCidr, 8000)
        if (network.connected) {
          initialized = true
          return prioritizeVpnNetwork(subnetCidr)
        }
      }
      await wait(300)
    }
    const liveOutput = recentOutput(output)
    const fileOutput = readRecentLog(files.logPath)
    const reason = failed || '连接超时：未收到 OpenVPN 初始化完成信号'
    const detail = [reason, liveOutput || fileOutput].filter(Boolean).join('\n')
    throw new Error(`OpenVPN 连接失败：${detail || '连接超时'}\n日志文件：${files.logPath}`)
  } catch (error) {
    await stopConnection()
    throw error
  }
}

async function connect({ host, port, roomID, username, token, subnetCidr }) {
  const executable = locateOpenVpn()
  if (!executable) throw new Error('未检测到 OpenVPN 运行组件，请重新运行完整安装包')
  if (!token || !username || !roomID || !subnetCidr) throw new Error('OpenVPN 房间凭据不完整')

  await stopConnection()
  await stopStaleWelOpenVpnProcesses()

  let lastError = null
  for (let attempt = 1; attempt <= CONNECT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await connectAttempt({ executable, host, port, roomID, username, token, subnetCidr })
    } catch (error) {
      lastError = error
      if (attempt >= CONNECT_MAX_ATTEMPTS || !isRetryableConnectError(error)) throw error
      await wait(attempt * 1200)
    }
  }
  throw lastError
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  CONNECT_MAX_ATTEMPTS,
  CONNECT_TIMEOUT_MS,
  OPENVPN_DATA_CIPHERS,
  OPENVPN_FALLBACK_CIPHER,
  OPENVPN_PROGRESS,
  OPENVPN_REMOTE_CERT_EKU,
  TAP_NAME,
  connect,
  isRetryableConnectError,
  openVpnConfigPath,
  readRecentLog,
  status,
  stopConnection,
}
