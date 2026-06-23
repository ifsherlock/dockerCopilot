import React, { useEffect, useMemo, useState } from 'react'

export function IconWithFallback({ sources = [], alt = '', className = '', fallback = null }) {
  const iconSources = useMemo(() => {
    const seen = new Set()
    return sources
      .map(source => String(source || '').trim())
      .filter(source => {
        if (!source || seen.has(source)) return false
        seen.add(source)
        return true
      })
  }, [sources])
  const [failed, setFailed] = useState({})

  useEffect(() => {
    setFailed({})
  }, [iconSources.join('|')])

  const src = iconSources.find(source => !failed[source])
  if (!src) return fallback

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(prev => ({ ...prev, [src]: true }))}
    />
  )
}
