export function quickLinkId(item) {
  const explicit = String(item?.quickLinkId || '').trim()
  if (explicit) return explicit
  const name = String(item?.name || item?.containerName || '').trim().replace(/^\//, '').toLowerCase()
  if (name) return `container:${name}`
  return String(item?.id || item?.container || '').trim()
}
