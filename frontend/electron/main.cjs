const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { version: appVersion } = require('../package.json')
const { checkGameFirewall, configureGameFirewall } = require('./firewall.cjs')
const { decodeProcessOutput, findNetstatLines, inspectVpnNetwork, parseTasklistPids, prioritizeVpnNetwork, runPowerShell, runProcess } = require('./network.cjs')
const openvpn = require('./openvpn.cjs')

if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox')
}

const API_URL = process.env.VITE_API_BASE_URL || 'http://8.133.189.9:8082/api/v1'
const LOG_DIRECTORY = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'WELPlatform', 'logs')
const LOG_FILE = path.join(LOG_DIRECTORY, 'main.log')

let mainWindow = null
let isQuitting = false
let vpnShutdownComplete = false

function writeLog(message, error) {
  try {
    fs.mkdirSync(LOG_DIRECTORY, { recursive: true })
    const detail = error instanceof Error ? `${error.stack || error.message}` : String(error || '')
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}${detail ? `\r\n${detail}` : ''}\r\n`, 'utf8')
  } catch {
    // Logging must never prevent the application from starting.
  }
}

function showFatalError(error) {
  writeLog('应用发生致命错误', error)
  const detail = error instanceof Error ? error.message : String(error || '未知错误')
  dialog.showErrorBox('WEL职业联盟对战平台启动失败', `${detail}\n\n错误日志：${LOG_FILE}`)
}

function frontendEntryPath() {
  const packagedEntry = path.join(process.resourcesPath, 'frontend', 'index.html')
  if (app.isPackaged && fs.existsSync(packagedEntry)) return packagedEntry
  return path.join(__dirname, '..', 'dist', 'index.html')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 760, minWidth: 900, minHeight: 620,
    title: `WEL职业联盟对战平台 v${appVersion}`,
    backgroundColor: '#f4f7f6',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow.minimize()
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`渲染进程退出：${details.reason}，代码 ${details.exitCode}`)
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    writeLog(`前端页面加载失败：${errorCode} ${errorDescription} ${validatedURL}`)
  })
  const entryPath = frontendEntryPath()
  const entryUrl = pathToFileURL(entryPath).toString()
  writeLog(`正在加载前端页面：${entryUrl}`)
  mainWindow.loadURL(entryUrl).catch((error) => {
    showFatalError(error)
    app.quit()
  })
}

function createChineseMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [{ role: 'reload', label: '重新载入' }, { type: 'separator' }, { role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [{ role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '查看', submenu: [{ role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { type: 'separator' }, { role: 'togglefullscreen', label: '全屏' }] },
    { label: '帮助', submenu: [
      { label: '关于 WEL职业联盟对战平台', click: () => dialog.showMessageBox({ type: 'info', title: '关于', message: `WEL职业联盟对战平台 v${appVersion}` }) },
    ] },
  ]))
}

function resolveGameExecutable(gamePath) {
  const normalized = path.normalize(String(gamePath || '').trim().replace(/^"(.*)"$/, '$1'))
  if (!normalized || !fs.existsSync(normalized)) throw new Error('找不到 WE8 游戏程序')
  if (!fs.statSync(normalized).isFile() || path.extname(normalized).toLowerCase() !== '.exe') throw new Error('选择的 WE8 路径不是可执行文件')
  return normalized
}

async function parseGameNetwork() {
  if (process.platform !== 'win32') return '仅支持 Windows 客户端'
  const system32 = `${process.env.SystemRoot || 'C:\\Windows'}\\System32`
  const tasklist = await runProcess(`${system32}\\tasklist.exe`, ['/FO', 'CSV', '/NH'])
  const processes = parseTasklistPids(tasklist)
  if (!processes.length) return '未检测到 WE8/DirectPlay 进程'
  const [udp, tcp] = await Promise.allSettled([
    runProcess(`${system32}\\netstat.exe`, ['-ano', '-p', 'udp']),
    runProcess(`${system32}\\netstat.exe`, ['-ano', '-p', 'tcp']),
  ])
  const lines = processes.map(({ name, pid }) => `进程: ${name} PID=${pid}`)
  if (udp.status === 'fulfilled') lines.push(...findNetstatLines(udp.value, processes).map((line) => `UDP: ${line}`))
  if (tcp.status === 'fulfilled') lines.push(...findNetstatLines(tcp.value, processes).map((line) => `TCP: ${line}`))
  if (!lines.some((line) => line.startsWith('UDP:'))) lines.push('UDP: 当前未捕捉到 WE8/DirectPlay UDP 监听')
  return lines.join('\n')
}

const DIAGNOSTIC_FIREWALL_RULES = [
  'WEL WE8 Game Inbound',
  'WEL WE8 Game Outbound',
  'WEL WE8 Game Broadcast Outbound',
  'WEL VPN UDP Inbound',
  'WEL VPN UDP Outbound',
  'WEL VPN UDP Broadcast Outbound',
]

async function readNetworkProfile(network) {
  if (process.platform !== 'win32' || !network?.interfaceIndex) return '网络类别: 未知'
  try {
    const output = await runPowerShell(`
$idx = ${Number(network.interfaceIndex)}
try {
  $profile = Get-NetConnectionProfile -InterfaceIndex $idx -ErrorAction Stop | Select-Object -First 1
  if ($null -ne $profile) {
    [Console]::Out.WriteLine(("网络类别: {0} / {1}" -f $profile.Name, $profile.NetworkCategory))
    exit 0
  }
} catch {}
[Console]::Out.WriteLine('网络类别: 当前系统不支持自动读取或未识别')
`, 5000)
    return output.trim() || '网络类别: 未知'
  } catch {
    return '网络类别: 读取失败'
  }
}

async function readFirewallDiagnostics() {
  if (process.platform !== 'win32') return '防火墙规则: 仅支持 Windows 客户端'
  const netsh = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\netsh.exe`
  const lines = []
  for (const name of DIAGNOSTIC_FIREWALL_RULES) {
    try {
      await runProcess(netsh, ['advfirewall', 'firewall', 'show', 'rule', `name=${name}`, 'verbose'], 5000)
      lines.push(`${name}: 存在`)
    } catch {
      lines.push(`${name}: 缺失`)
    }
  }
  return `防火墙规则:\n${lines.join('\n')}`
}

async function readArpDiagnostics() {
  if (process.platform !== 'win32') return 'ARP缓存: 仅支持 Windows 客户端'
  const arp = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\arp.exe`
  try {
    const output = await runProcess(arp, ['-a'], 5000)
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^10\.80\.\d+\.\d+\s+/.test(line))
      .slice(0, 20)
    return `ARP缓存(10.80): ${lines.length ? `\n${lines.join('\n')}` : '未发现 10.80 记录'}`
  } catch {
    return 'ARP缓存: 读取失败'
  }
}

async function readVirtualAdapterDiagnostics() {
  if (process.platform !== 'win32') return '虚拟网卡列表: 仅支持 Windows 客户端'
  try {
    const output = await runPowerShell(`
Get-WmiObject Win32_NetworkAdapter -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match 'TAP|OpenVPN|SoftEther|VPN|ZeroTier|Radmin|Hamachi|Gateway' -or
    $_.NetConnectionID -match 'TAP|OpenVPN|SoftEther|VPN|ZeroTier|Radmin|Hamachi|Gateway' -or
    $_.ServiceName -match 'tap0901|vpn|zerotier|radmin|hamachi'
  } |
  Sort-Object InterfaceIndex |
  ForEach-Object {
    [Console]::Out.WriteLine(("{0} | {1} | {2} | 启用={3} | 服务={4}" -f $_.InterfaceIndex, $_.NetConnectionID, $_.Name, $_.NetEnabled, $_.ServiceName))
  }
`, 8000)
    const lines = output.trim().split(/\r?\n/).filter(Boolean).slice(0, 30)
    return `虚拟网卡列表: ${lines.length ? `\n${lines.join('\n')}` : '未检测到相关虚拟网卡'}`
  } catch {
    return '虚拟网卡列表: 读取失败'
  }
}

function parsePingSummary(host, output) {
  const text = String(output || '').replace(/\r?\n/g, '\n')
  const reachable = /TTL=/i.test(text)
  const loss = text.match(/(\d+)%\s*(?:loss|丢失)/i)?.[1]
  const average = text.match(/(?:Average|平均)\s*[=<]\s*(\d+ms)/i)?.[1]
    || text.match(/平均\s*=\s*(\d+ms)/)?.[1]
  const parts = []
  if (reachable) parts.push('可达')
  else parts.push('不可达')
  if (average) parts.push(`平均 ${average}`)
  if (loss !== undefined) parts.push(`丢包 ${loss}%`)
  return { host, reachable, summary: parts.join('，') }
}

function pingHost(host) {
  const target = String(host || '').trim()
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(target)) throw new Error('Ping 地址不正确')
  const ping = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\ping.exe`
  return new Promise((resolve) => {
    const child = spawn(ping, ['-n', '4', '-w', '1000', target], { windowsHide: true })
    const stdout = []
    const stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.once('error', (error) => resolve({ host: target, reachable: false, summary: `Ping 失败：${error.message}` }))
    child.once('close', () => {
      const output = [decodeProcessOutput(stdout), decodeProcessOutput(stderr)].filter(Boolean).join('\n')
      resolve(parsePingSummary(target, output))
    })
  })
}

ipcMain.handle('openvpn-status', () => openvpn.status())
ipcMain.handle('prepare-openvpn', () => openvpn.prepare())
ipcMain.handle('connect-openvpn', async (_event, credentials) => openvpn.connect(credentials))
ipcMain.handle('disconnect-openvpn', () => openvpn.stopConnection())
ipcMain.handle('inspect-openvpn', (_event, { subnetCidr }) => inspectVpnNetwork(subnetCidr))
ipcMain.handle('prioritize-openvpn', (_event, { subnetCidr }) => prioritizeVpnNetwork(subnetCidr))
ipcMain.handle('ping-host', (_event, host) => pingHost(host))
ipcMain.handle('check-game-firewall', (_event, gamePath) => checkGameFirewall(resolveGameExecutable(gamePath)))
ipcMain.handle('configure-game-firewall', (_event, gamePath) => configureGameFirewall(resolveGameExecutable(gamePath)))
ipcMain.handle('choose-game', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '选择 WE8 游戏程序', properties: ['openFile'], filters: [{ name: 'WE8 游戏程序', extensions: ['exe'] }] })
  return result.canceled ? null : result.filePaths[0] || null
})
ipcMain.handle('launch-game', (_event, gamePath) => {
  const executable = resolveGameExecutable(gamePath)
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/d', '/c', 'start', '""', executable], { detached: true, windowsHide: true, stdio: 'ignore' })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
})
ipcMain.handle('copy-openvpn-diagnostics', async (_event, { subnetCidr, username }) => {
  const [desktop, network, gameNetwork] = await Promise.all([openvpn.status(), inspectVpnNetwork(subnetCidr), parseGameNetwork()])
  const [networkProfile, firewallDiagnostics, arpDiagnostics, virtualAdapters] = await Promise.all([
    readNetworkProfile(network),
    readFirewallDiagnostics(),
    readArpDiagnostics(),
    readVirtualAdapterDiagnostics(),
  ])
  clipboard.writeText([
    `WEL客户端版本: ${appVersion}`,
    `联机组件: ${desktop.ready ? '已准备' : '未准备'}`,
    `联机账号: ${username}`,
    `房间网段: ${subnetCidr}`,
    `实际虚拟IP: ${network.actualIp || '未获取'}`,
    `虚拟网卡: ${network.adapterDescription || network.adapterName || '未识别'}`,
    `虚拟网卡MAC: ${network.macAddress || '未获取'}`,
    `VPN接口跃点: ${network.interfaceMetric ?? '未知'}`,
    `诊断提示: ${network.warnings.join('；') || '无'}`,
    networkProfile,
    firewallDiagnostics,
    arpDiagnostics,
    virtualAdapters,
    `WE8网络: ${gameNetwork}`,
  ].join('\r\n'))
  return network
})

process.on('uncaughtException', (error) => showFatalError(error))
process.on('unhandledRejection', (error) => showFatalError(error))

writeLog(`正在启动 WEL职业联盟对战平台 v${appVersion}`)
app.whenReady()
  .then(() => {
    process.env.VITE_API_BASE_URL = API_URL
    createChineseMenu()
    createWindow()
    writeLog('主窗口已创建')
  })
  .catch((error) => {
    showFatalError(error)
    app.quit()
  })
app.on('before-quit', (event) => {
  isQuitting = true
  if (vpnShutdownComplete) return
  event.preventDefault()
  openvpn.stopConnection().finally(() => {
    vpnShutdownComplete = true
    app.quit()
  })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
