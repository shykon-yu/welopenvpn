const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { version: appVersion } = require('../package.json')
const { configureGameFirewall } = require('./firewall.cjs')
const { findNetstatLines, inspectVpnNetwork, parseTasklistPids, prioritizeVpnNetwork, runProcess } = require('./network.cjs')
const openvpn = require('./openvpn.cjs')

const API_URL = process.env.VITE_API_BASE_URL || 'http://8.133.189.9:8082/api/v1'
const LOG_DIRECTORY = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'WELOpenVPN', 'logs')
const LOG_FILE = path.join(LOG_DIRECTORY, 'main.log')

let mainWindow = null

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
  dialog.showErrorBox('WEL OpenVPN 对战平台启动失败', `${detail}\n\n错误日志：${LOG_FILE}`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180, height: 760, minWidth: 900, minHeight: 620,
    title: `WEL OpenVPN 对战平台 v${appVersion}`,
    backgroundColor: '#f4f7f6',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`渲染进程退出：${details.reason}，代码 ${details.exitCode}`)
  })
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch((error) => {
    showFatalError(error)
    app.quit()
  })
}

function createChineseMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '文件', submenu: [{ role: 'reload', label: '重新载入' }, { type: 'separator' }, { role: 'quit', label: '退出' }] },
    { label: '编辑', submenu: [{ role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' }, { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }] },
    { label: '查看', submenu: [{ role: 'resetZoom', label: '实际大小' }, { role: 'zoomIn', label: '放大' }, { role: 'zoomOut', label: '缩小' }, { type: 'separator' }, { role: 'togglefullscreen', label: '全屏' }] },
    { label: '帮助', submenu: [{ label: '关于 WEL OpenVPN 对战平台', click: () => dialog.showMessageBox({ type: 'info', title: '关于', message: `WEL OpenVPN 对战平台 v${appVersion}` }) }] },
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

ipcMain.handle('openvpn-status', () => openvpn.status())
ipcMain.handle('prepare-openvpn', () => {
  const current = openvpn.status()
  if (!current.ready) throw new Error(current.message)
  return current
})
ipcMain.handle('connect-openvpn', async (_event, credentials) => openvpn.connect(credentials))
ipcMain.handle('disconnect-openvpn', () => openvpn.stopConnection())
ipcMain.handle('inspect-openvpn', (_event, { subnetCidr }) => inspectVpnNetwork(subnetCidr))
ipcMain.handle('prioritize-openvpn', (_event, { subnetCidr }) => prioritizeVpnNetwork(subnetCidr))
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
  const [desktop, network, gameNetwork] = await Promise.all([openvpn.status(), inspectVpnNetwork(subnetCidr), parseGameNetwork()()])
  clipboard.writeText([
    `WEL OpenVPN 客户端版本: ${appVersion}`,
    `OpenVPN 组件: ${desktop.ready ? '已准备' : '未准备'}`,
    `OpenVPN 账号: ${username}`,
    `房间网段: ${subnetCidr}`,
    `实际虚拟IP: ${network.actualIp || '未获取'}`,
    `虚拟网卡: ${network.adapterDescription || network.adapterName || '未识别'}`,
    `VPN接口跃点: ${network.interfaceMetric ?? '未知'}`,
    `诊断提示: ${network.warnings.join('；') || '无'}`,
    `WE8网络: ${gameNetwork}`,
  ].join('\r\n'))
  return network
})

process.on('uncaughtException', (error) => showFatalError(error))
process.on('unhandledRejection', (error) => showFatalError(error))

writeLog(`正在启动 WEL OpenVPN 对战平台 v${appVersion}`)
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
app.on('before-quit', () => openvpn.stopConnection())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
