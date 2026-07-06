import React, { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { imageRiskHints } from './imageUtils.js'

export function SafeImage({ src, alt, className, fallback }) {
  const [hasError, setHasError] = React.useState(false)

  if (hasError || !src) {
    return fallback
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

export function ImageRiskHint({ image }) {
  const hints = imageRiskHints(image)
  const [open, setOpen] = useState(false)

  if (!image?.multiRef || image?.inUsed || hints.length === 0) return null

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(v => !v)
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/20 dark:hover:text-amber-200"
        title="查看镜像说明"
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-6 top-1/2 z-[120] w-72 -translate-y-1/2 rounded-xl border border-amber-200 bg-white p-3 text-left shadow-2xl dark:border-amber-800 dark:bg-gray-900">
          <div className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-300">镜像说明</div>
          <div className="space-y-1.5 text-xs leading-5 text-gray-700 dark:text-gray-200">
            {hints.map((hint, idx) => <div key={idx}>{hint}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}
