import { quickLinkId } from '../../utils/quickLinks.js'

export function sanitizeComposeProjectName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_. -]/g, '').replace(/[ .]+/g, '-').replace(/^[-_]+|[-_]+$/g, '') || 'app'
}

export function defaultComposeBaseDir(name) {
  return `/data/compose/${sanitizeComposeProjectName(name)}`
}

function normalizePosixPath(path) {
  const absolute = String(path || '').startsWith('/')
  const parts = []
  String(path || '').split('/').forEach(part => {
    if (!part || part === '.') return
    if (part === '..') {
      if (parts.length > 0) parts.pop()
      return
    }
    parts.push(part)
  })
  return `${absolute ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.')
}

function resolveRelativePath(baseDir, source) {
  return normalizePosixPath(`${String(baseDir || '').replace(/\/+$/, '')}/${source}`)
}

function isRelativeBindSource(source) {
  const value = String(source || '').trim()
  return value === '.' || value === '..' || value.startsWith('./') || value.startsWith('../')
}

function parseVolumeSpec(spec) {
  const parts = String(spec || '').split(':')
  if (parts.length < 2) return null
  const source = parts[0].trim()
  if (!isRelativeBindSource(source)) return null
  return { source, target: parts.slice(1).join(':') }
}

export function resolveComposeRelativeVolumes(content, baseDir) {
  const mappings = []
  let inVolumes = false
  let volumesIndent = -1
  const lines = String(content || '').split('\n')
  const resolved = lines.map(line => {
    const sectionMatch = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*$/)
    if (sectionMatch) {
      const indent = sectionMatch[1].length
      const key = sectionMatch[2]
      if (key === 'volumes') {
        inVolumes = true
        volumesIndent = indent
      } else if (inVolumes && indent <= volumesIndent) {
        inVolumes = false
        volumesIndent = -1
      }
    }
    if (!inVolumes) return line
    const itemMatch = line.match(/^(\s*-\s*)(['"]?)([^'"]+)(\2)(\s*(?:#.*)?)$/)
    if (!itemMatch) return line
    const parsed = parseVolumeSpec(itemMatch[3])
    if (!parsed) return line
    const absolute = resolveRelativePath(baseDir, parsed.source)
    mappings.push({ from: parsed.source, to: absolute, target: parsed.target })
    return `${itemMatch[1]}${itemMatch[2]}${absolute}:${parsed.target}${itemMatch[2]}${itemMatch[5]}`
  }).join('\n')
  return { content: resolved, mappings }
}

export function extractTemplateVariables(content) {
  const found = new Set()
  String(content || '').replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
    found.add(name)
    return _
  })
  return Array.from(found).sort()
}

export function isPortVariable(name) {
  return /PORT/i.test(name)
}

export function defaultTemplateValue(name, projectName) {
  if (name === 'CONTAINER_NAME') return sanitizeComposeProjectName(projectName)
  return ''
}

export function applyTemplateVariables(content, values, projectName) {
  return String(content || '').replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => {
    const value = String(values[name] ?? defaultTemplateValue(name, projectName) ?? '').trim()
    return value || match
  })
}

export function externalNetworkNames(content) {
  const names = []
  const lines = String(content || '').split('\n')
  let inNetworks = false
  let networkIndent = -1
  let current = null
  let currentIndent = -1
  for (const line of lines) {
    const section = line.match(/^(\s*)([A-Za-z0-9_.-]+):\s*$/)
    if (section) {
      const indent = section[1].length
      const key = section[2]
      if (key === 'networks') {
        inNetworks = true
        networkIndent = indent
        current = null
        currentIndent = -1
        continue
      }
      if (inNetworks && indent <= networkIndent) {
        inNetworks = false
      }
      if (inNetworks && indent > networkIndent) {
        current = key
        currentIndent = indent
      }
    }
    if (inNetworks && current && line.match(new RegExp(`^\\s{${currentIndent + 2},}external:\\s*true\\s*$`, 'i'))) {
      names.push(current)
    }
  }
  return Array.from(new Set(names))
}

export function progressToText(progress) {
  if (!progress) return ''
  if (Array.isArray(progress.logs) && progress.logs.length) return progress.logs.join('\n')
  return progress.detailMsg || progress.message || ''
}

export function isContainerRunning(item) {
  const state = String(item?.state || item?.status || '').toLowerCase()
  return state === 'running' || state.includes('up')
}

function normalizeContainerUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  return /^https?:\/\//i.test(url) ? url : `http://${url}`
}

function hostForProjectLinks() {
  return window.location.hostname || '127.0.0.1'
}

export function inferContainerWebUrl(item) {
  const ports = String(item?.ports || '').trim()
  const mapped = ports.match(/(?:0\.0\.0\.0|\[::\]|127\.0\.0\.1|localhost)?(?::)?(\d{2,5})\s*->/i)
    || ports.match(/(?:^|[\s,])(\d{2,5})\s*:\s*\d{2,5}/)
  if (mapped?.[1]) return normalizeContainerUrl(`${hostForProjectLinks()}:${mapped[1]}`)

  const text = `${item?.name || ''} ${item?.image || ''} ${item?.service || ''}`.toLowerCase()
  if (text.includes('dockercopilot') || text.includes('docker-copilot')) return normalizeContainerUrl(`${hostForProjectLinks()}:12712`)
  if (text.includes('moviepilot')) return normalizeContainerUrl(`${hostForProjectLinks()}:13080`)
  return ''
}

export function addProjectContainerQuickLink(item) {
  const url = inferContainerWebUrl(item)
  if (!url) throw new Error('没有可用 Web URL')
  const key = 'docker_copilot_overview_quick_links'
  const parsed = JSON.parse(localStorage.getItem(key) || '{}')
  const prefs = {
    order: Array.isArray(parsed.order) ? parsed.order : [],
    hidden: parsed.hidden && typeof parsed.hidden === 'object' ? parsed.hidden : {},
    deleted: parsed.deleted && typeof parsed.deleted === 'object' ? parsed.deleted : {},
    manual: Array.isArray(parsed.manual) ? parsed.manual : [],
  }
  const id = quickLinkId(item)
  const link = {
    id,
    name: item.name || item.service || id,
    url,
    status: item.state || item.status || '',
    image: item.image || '',
    container: item.id || '',
  }
  prefs.manual = prefs.manual.filter(existing => existing.id !== id).concat(link)
  delete prefs.hidden[id]
  delete prefs.deleted[id]
  if (!prefs.order.includes(id)) prefs.order.push(id)
  localStorage.setItem(key, JSON.stringify(prefs))
  window.dispatchEvent(new Event('storage'))
  window.dispatchEvent(new CustomEvent('docker-copilot-quick-links-updated'))
  return url
}
