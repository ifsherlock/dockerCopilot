import { cn } from '../../utils/cn.js'

export const MIN_REFRESH_VISIBLE_MS = 500

export const batchButtonClass = (enabledClass, disabled) => cn(
  'inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:min-w-0 sm:px-3',
  disabled
    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 opacity-70 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-500'
    : enabledClass
)

export function stripEnglishConflictPrefix(rawMsg) {
  const msg = String(rawMsg || '').trim()
  if (!msg) return ''
  const lines = msg.split('\n').map(s => s.trim()).filter(Boolean)
  return lines.length > 1 ? lines.join('\n') : ''
}

export function humanizeImageDeleteError(rawMsg, image, force) {
  const msg = String(rawMsg || '').trim()
  if (!msg) return force ? '强制删除镜像失败' : '删除镜像失败'
  const lower = msg.toLowerCase()
  let human = `删除失败:${msg}`
  if (lower.includes('conflict') && lower.includes('container')) {
    human = '删除失败:这个镜像仍被容器引用,Docker 不允许直接删除。请先删除/替换相关容器,或改用"强制删除"。'
  } else if (lower.includes('conflict') && (lower.includes('repository reference') || lower.includes('must be forced'))) {
    human = '删除失败:这个镜像还有多个标签或仓库引用,普通删除不会生效。请改用"强制删除"。'
  } else if (lower.includes('image is being used by running container')) {
    human = '删除失败:这个镜像正被运行中的容器使用,必须先停掉或替换容器,或使用"强制删除"。'
  } else if (lower.includes('no such image')) {
    human = '删除失败:这个镜像已经不存在了,刷新列表后再看一下。'
  }
  const raw = stripEnglishConflictPrefix(msg)
  return raw ? `${raw}\n\n${human}` : human
}

export function imageRiskHints(image) {
  const hints = []
  if (image?.multiRef) {
    hints.push('这是多引用镜像:同一个镜像 ID 仍挂着多个 tag 或多个仓库引用。')
    hints.push('普通删除可能失败,因为 Docker 往往只允许在无额外引用时直接删除。')
    hints.push('如果普通删除失败,可改用"强制删除"。')
  }
  return hints
}

export function normalizeImageName(value) {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^registry-1\.docker\.io\//, '')
    .replace(/^docker\.io\//, '')
    .replace(/^library\//, '')
    .toLowerCase()
}

export function canonicalImageName(value) {
  let v = normalizeImageName(value)
  if (!v) return ''
  const slash = v.lastIndexOf('/')
  const colon = v.lastIndexOf(':')
  if (colon <= slash && !v.includes('@')) v = `${v}:latest`
  return v
}

export function getImageBlacklistCandidates(image) {
  const refs = [
    image?.name && image?.tag && image.tag !== 'None' && image.tag !== '<none>' ? `${image.name}:${image.tag}` : '',
    image?.name,
  ].map(canonicalImageName).filter(Boolean)
  return Array.from(new Set(refs))
}

export function matchesImageBlacklistItem(image, item) {
  const normalizedItem = canonicalImageName(item)
  if (!normalizedItem) return false
  return getImageBlacklistCandidates(image).some(candidate => candidate === normalizedItem || candidate.startsWith(`${normalizedItem}:`) || normalizedItem.startsWith(`${candidate}:`))
}

export function formatImageSize(sizeStr) {
  if (!sizeStr) return '0 MB'
  return sizeStr.replace(/mb/gi, 'MB')
    .replace(/gb/gi, 'GB')
    .replace(/kb/gi, 'KB')
}

export function formatTableDateTime(value) {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  const normalized = raw
    .replace('T', ' ')
    .replace(/\//g, '-')
    .replace(/\.\d+Z?$/, '')
    .replace(/\s*UTC$/i, '')
    .trim()
  const matched = normalized.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/)
  if (matched) return `${matched[1]} ${matched[2]}`
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    const pad = (n) => String(n).padStart(2, '0')
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
  }
  return normalized
}

export function getSizeInMB(size) {
  const raw = String(size || '').trim().toLowerCase()
  const value = parseFloat(raw) || 0
  if (raw.includes('gb')) return value * 1024
  if (raw.includes('kb')) return value / 1024
  return value
}

export function getSizeColor(size) {
  const sizeInMB = getSizeInMB(size)
  if (sizeInMB < 200) return 'text-green-600 dark:text-green-400'
  if (sizeInMB < 1024) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

export function shortImageId(id) {
  return (id || '').replace(/^sha256:/, '').slice(0, 12)
}

export function buildPullTarget(image) {
  const name = String(image?.name || '').trim()
  const tag = String(image?.tag || '').trim()
  if (!name || name === 'None' || !tag || tag === 'None' || tag === '<none>') return ''
  return `${name}:${tag}`
}

export function canonicalRepoLink(image) {
  const name = String(image?.name || '').trim()
  if (!name || name === 'None') return ''
  if (name.startsWith('ghcr.io/')) {
    const parts = name.split('/').filter(Boolean)
    if (parts.length >= 3) {
      const owner = parts[1]
      const pkg = parts.slice(2).join('/')
      return `https://github.com/users/${owner}/packages/container/package/${pkg}`
    }
    return image?.repoLinks?.github || ''
  }
  return image?.repoLinks?.dockerHub || `https://hub.docker.com/r/${name.includes('/') ? name : `library/${name}`}`
}
