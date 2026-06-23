import { getBuiltInImageLogo, getCustomImageLogo } from '../config/imageLogos.js'
import { imageAPI } from '../api/client.js'

export const faviconCacheKey = 'docker_copilot_favicon_cache_v1'

export function getContainerImageRef(item) {
  return item?.image || item?.usingImage || item?.createImage || item?.Image || ''
}

export function getContainerWebUrl(item) {
  const endpoint = item?.endpointLink || item?.EndpointLink || {}
  const direct = item?.url || item?.webUrl || item?.webui || item?.webUI || endpoint?.suggestedURL
  if (direct) return normalizeWebUrl(direct)
  const host = String(endpoint?.hostIP || '').trim()
  const port = String(endpoint?.editablePort || endpoint?.chosenPort || '').trim()
  if (host && port) return normalizeWebUrl(`${host}:${port}`)
  return ''
}

export function resolveContainerIconUrl(item, customIcons = {}) {
  return resolveContainerCustomIconUrl(item, customIcons) || resolveContainerBuiltInIconUrl(item)
}

export function resolveContainerCustomIconUrl(item, customIcons = {}) {
  const explicitIcon = String(item?.iconUrl || item?.IconUrl || '').trim()
  if (explicitIcon.startsWith('/src/config/image/')) return explicitIcon
  const imageRef = getContainerImageRef(item)
  return getCustomImageLogo(imageRef, customIcons, [item?.name, item?.containerName, item?.service].filter(Boolean))
}

export function resolveContainerBuiltInIconUrl(item) {
  const imageRef = getContainerImageRef(item)
  return getBuiltInImageLogo(imageRef, [item?.name, item?.containerName, item?.service].filter(Boolean))
}

export function getCachedFavicon(url) {
  const cacheKey = faviconCacheId(url)
  if (!cacheKey) return ''
  try {
    const parsed = JSON.parse(localStorage.getItem(faviconCacheKey) || '{}')
    const item = parsed[cacheKey]
    if (!item) return ''
    const maxAge = item.url ? 7 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000
    if (Date.now() - Number(item.at || 0) > maxAge) return ''
    return item.url || ''
  } catch {
    return ''
  }
}

export async function resolveFaviconFallback(url) {
  const normalized = normalizeWebUrl(url)
  const cacheKey = faviconCacheId(normalized)
  if (!cacheKey) return ''
  const cached = getCachedFavicon(normalized)
  if (cached) return cached
  try {
    const response = await imageAPI.resolveFavicon(normalized)
    const faviconUrl = response.data?.data?.url || ''
    writeFaviconCache(cacheKey, faviconUrl)
    return faviconUrl
  } catch {
    writeFaviconCache(cacheKey, '')
    return ''
  }
}

export function normalizeWebUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return `http://${raw}`
}

function faviconCacheId(value) {
  const normalized = normalizeWebUrl(value)
  if (!normalized) return ''
  try {
    const parsed = new URL(normalized)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return normalized
  }
}

function writeFaviconCache(cacheKey, url) {
  try {
    const parsed = JSON.parse(localStorage.getItem(faviconCacheKey) || '{}')
    parsed[cacheKey] = { url, at: Date.now() }
    localStorage.setItem(faviconCacheKey, JSON.stringify(parsed))
  } catch {
    // favicon 是兜底能力，缓存失败不影响页面主流程。
  }
}
