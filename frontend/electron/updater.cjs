const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const path = require('node:path')

const GITHUB_UPDATE_URL = 'https://github.com/shykon-yu/welopenvpn/releases/download/windows-client-latest/latest.json'
const SERVER_UPDATE_URL = 'http://8.133.189.9:1421/downloads/welopenvpn/latest.json'

function compareVersions(left, right) {
  const leftParts = String(left || '').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = String(right || '').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index++) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  return 0
}

function requestUrl(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = String(url).startsWith('https:') ? https : http
    const request = client.get(url, {
      headers: {
        'User-Agent': 'WEL-Platform-Updater',
        Accept: 'application/json, application/octet-stream, */*',
      },
    }, (response) => {
      const location = response.headers.location
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && location && redirects < 5) {
        response.resume()
        resolve(requestUrl(new URL(location, url).toString(), redirects + 1))
        return
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume()
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }
      resolve(response)
    })
    request.setTimeout(30000, () => {
      request.destroy(new Error('请求更新信息超时'))
    })
    request.once('error', reject)
  })
}

async function fetchJson(url) {
  const response = await requestUrl(url)
  const chunks = []
  for await (const chunk of response) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function fetchUpdateInfo(currentVersion, updateUrls = [GITHUB_UPDATE_URL, SERVER_UPDATE_URL]) {
  let lastError = null
  for (const url of updateUrls) {
    try {
      const info = await fetchJson(url)
      if (!info.version) throw new Error('更新信息缺少版本号')
      return {
        available: compareVersions(info.version, currentVersion) > 0,
        currentVersion,
        version: String(info.version),
        notes: String(info.notes || ''),
        githubUrl: info.githubUrl || info.url || '',
        serverUrl: info.serverUrl || '',
        sourceUrl: url,
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('无法获取更新信息')
}

async function downloadFile(url, destinationPath) {
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true })
  const response = await requestUrl(url)
  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destinationPath)
    response.pipe(file)
    file.once('finish', () => file.close(resolve))
    file.once('error', reject)
    response.once('error', reject)
  })
  return destinationPath
}

async function downloadInstaller(updateInfo, destinationDirectory) {
  const filename = `WEL-Platform-Setup-${updateInfo.version}.exe`
  const destinationPath = path.join(destinationDirectory, filename)
  const urls = [updateInfo.githubUrl, updateInfo.serverUrl].filter(Boolean)
  let lastError = null
  for (const url of urls) {
    try {
      await downloadFile(url, destinationPath)
      return { path: destinationPath, url }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('没有可用的安装包下载地址')
}

module.exports = {
  compareVersions,
  downloadInstaller,
  fetchUpdateInfo,
  GITHUB_UPDATE_URL,
  SERVER_UPDATE_URL,
}
