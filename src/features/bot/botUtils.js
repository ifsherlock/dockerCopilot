export function normalizeImageName(value) {
  return String(value || '').trim()
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

export function normalizeCronExpression(value) {
	return String(value || '').trim().replace(/\s+/g, ' ')
}

export function isDisabledCronExpression(value) {
  const normalized = normalizeCronExpression(value).toLowerCase()
  return ['off', 'false', '0', 'no'].includes(normalized)
}

export function splitCronFields(value) {
	return normalizeCronExpression(value).split(' ').filter(Boolean)
}

export function explainCronField(field, min, max) {
  if (!field) return '不能为空'
  const parts = String(field).split(',')
  for (const part of parts) {
    if (!part) return '列表里有空项'
    const [rangePart, stepPart] = part.split('/')
    if (part.split('/').length > 2) return `字段「${field}」的 / 只能出现一次`
    if (stepPart !== undefined && (!/^\d+$/.test(stepPart) || Number(stepPart) <= 0)) return `步长「${stepPart}」无效`
    if (rangePart === '*') continue
    if (rangePart.includes('-')) {
      const [start, end] = rangePart.split('-')
      if (!/^\d+$/.test(start) || !/^\d+$/.test(end)) return `范围「${rangePart}」无效`
      const a = Number(start), b = Number(end)
      if (a > b || a < min || b > max) return `范围「${rangePart}」应在 ${min}-${max}`
      continue
    }
    if (!/^\d+$/.test(rangePart)) return `字段「${field}」只能使用数字、*、,、-、/`
    const n = Number(rangePart)
    if (n < min || n > max) return `数值「${rangePart}」应在 ${min}-${max}`
  }
  return ''
}

export function validateCronExpression(value) {
  const cron = normalizeCronExpression(value)
  if (isDisabledCronExpression(cron)) return { ok: true, normalized: 'off', message: '' }
  const fields = splitCronFields(cron)
  if (fields.length !== 5) return { ok: false, normalized: cron, message: `Cron 必须是 5 段；当前是 ${fields.length} 段。例：40 13 * * *` }
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
  for (let i = 0; i < fields.length; i++) {
    const err = explainCronField(fields[i], ranges[i][0], ranges[i][1])
    if (err) return { ok: false, normalized: cron, message: `第 ${i + 1} 段无效：${err}` }
  }
  return { ok: true, normalized: cron, message: '' }
}
