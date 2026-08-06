export type DesktopLease = {
  host: string
  port: number
  username: string
  subnetCidr: string
  roomID: number
  token: string
}

export type DesktopLeaseStatus = {
  connected: boolean
  actualIp: string | null
  subnetCidr: string
  adapterName: string | null
  adapterDescription: string | null
  interfaceIndex: number | null
  interfaceMetric: number | null
  defaultGateways: string[]
  dnsServers: string[]
  conflictingAdapters: string[]
  conflictingAdapterIndexes: number[]
  warnings: string[]
  nicName?: string
}

export type DesktopStatus = {
  ready: boolean
  message: string
  openvpnInstalled: boolean
  tapName?: string
}

declare global {
  interface Window {
    we8Desktop?: {
      connectVpn: (lease: DesktopLease) => Promise<DesktopLeaseStatus>
      restoreVpn: (lease: Pick<DesktopLease, 'username' | 'subnetCidr'>) => Promise<DesktopLeaseStatus>
      inspectVpn: (lease: Pick<DesktopLease, 'username' | 'subnetCidr'>) => Promise<DesktopLeaseStatus>
      prioritizeVpn: (lease: Pick<DesktopLease, 'username' | 'subnetCidr'>) => Promise<DesktopLeaseStatus>
      copyVpnDiagnostics: (lease: Pick<DesktopLease, 'username' | 'subnetCidr'>) => Promise<DesktopLeaseStatus>
      configureGameFirewall: (gamePath: string) => Promise<void>
      desktopStatus: () => Promise<DesktopStatus>
      prepareDesktop: () => Promise<DesktopStatus>
      disconnectVpn: (username: string) => Promise<void>
      chooseGame: () => Promise<string | null>
      launchGame: (gamePath: string) => Promise<void>
    }
  }
}

export {}
