import { useCallback, useEffect, useRef, useState } from 'react'

export function useResizableTableColumns(storageKey, defaults) {
  const [widths, setWidths] = useState(defaults)
  const resizeStateRef = useRef(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        setWidths(prev => ({ ...prev, ...parsed }))
      }
    } catch {
      // ignore invalid cache
    }
  }, [storageKey])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths))
    } catch {
      // ignore storage write failure
    }
  }, [storageKey, widths])

  useEffect(() => {
    const onMouseMove = (event) => {
      const state = resizeStateRef.current
      if (!state) return
      const delta = event.clientX - state.startX
      const nextWidth = Math.max(state.minWidth || 60, state.startWidth + delta)
      setWidths(prev => ({ ...prev, [state.key]: nextWidth }))
    }

    const stopResize = () => {
      resizeStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stopResize)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stopResize)
    }
  }, [])

  const startResize = useCallback((key, minWidth = 60) => (event) => {
    event.preventDefault()
    event.stopPropagation()
    resizeStateRef.current = {
      key,
      startX: event.clientX,
      startWidth: widths[key] || defaults[key] || minWidth,
      minWidth,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [defaults, widths])

  const resetWidths = useCallback(() => {
    setWidths(defaults)
  }, [defaults])

  return {
    widths,
    startResize,
    resetWidths,
  }
}
