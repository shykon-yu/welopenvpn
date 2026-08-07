const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('we8Desktop', {
  connectVpn: (credentials) => ipcRenderer.invoke('connect-openvpn', credentials),
  restoreVpn: (lease) => ipcRenderer.invoke('inspect-openvpn', lease),
  inspectVpn: (lease) => ipcRenderer.invoke('inspect-openvpn', lease),
  prioritizeVpn: (lease) => ipcRenderer.invoke('prioritize-openvpn', lease),
  copyVpnDiagnostics: (lease) => ipcRenderer.invoke('copy-openvpn-diagnostics', lease),
  checkGameFirewall: (gamePath) => ipcRenderer.invoke('check-game-firewall', gamePath),
  configureGameFirewall: (gamePath) => ipcRenderer.invoke('configure-game-firewall', gamePath),
  desktopStatus: () => ipcRenderer.invoke('openvpn-status'),
  prepareDesktop: () => ipcRenderer.invoke('prepare-openvpn'),
  disconnectVpn: () => ipcRenderer.invoke('disconnect-openvpn'),
  pingHost: (host) => ipcRenderer.invoke('ping-host', host),
  chooseGame: () => ipcRenderer.invoke('choose-game'),
  launchGame: (gamePath) => ipcRenderer.invoke('launch-game', gamePath),
})
