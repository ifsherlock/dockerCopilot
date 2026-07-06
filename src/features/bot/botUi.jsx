import React from 'react'
import { cn } from '../../utils/cn.js'

export const cardClass = 'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm'
export const cardHeaderClass = 'flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 px-4 py-3'
export const cardBodyClass = 'p-4'
export const inputClass = 'min-h-9 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:border-transparent focus:ring-2 focus:ring-primary-500'

export function SectionToggle({ checked, onChange, textOn = 'ON', textOff = 'OFF' }) {
  return (
    <button onClick={onChange} className="inline-flex items-center gap-2">
      <span className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')}>
        <span className={cn('absolute top-1 h-3 w-3 rounded-full bg-white transition-transform', checked ? 'left-5' : 'left-1')} />
      </span>
      <span className={cn('text-xs font-semibold', checked ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400')}>
        {checked ? textOn : textOff}
      </span>
    </button>
  )
}

export function Field({ label, children, full = false }) {
  return (
    <div className={cn(full ? 'sm:col-span-2' : '', 'space-y-1')}>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      {children}
    </div>
  )
}
