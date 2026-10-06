'use client'

import { useId } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details open={defaultOpen} className="group border-b border-dashed border-border">
      <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-xs font-medium tracking-widest text-foreground uppercase select-none hover:bg-accent/40">
        {title}
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div className="flex flex-col gap-4 px-5 pt-1 pb-5">{children}</div>
    </details>
  )
}

function Label({ id, children, value }: { id: string; children: ReactNode; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {children}
      </label>
      {value !== undefined && <span className="tabular-nums text-foreground">{value}</span>}
    </div>
  )
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={id} value={format ? format(value) : String(Number(value.toFixed(3)))}>
        {label}
      </Label>
      <input
        id={id}
        type="range"
        className="ctl-range w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          'relative h-5 w-9 border transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2',
          value ? 'border-foreground bg-foreground' : 'border-border bg-transparent',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-3.5 transition-all',
            value ? 'left-[1.15rem] bg-background' : 'left-0.5 bg-muted-foreground',
          )}
        />
      </button>
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 w-full border border-border bg-background px-2 text-xs text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-xs text-muted-foreground">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="grid auto-cols-fr grid-flow-col border border-border">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-8 px-1 text-[11px] tracking-wide uppercase transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4',
              value === o.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="tabular-nums text-foreground uppercase">{value}</span>
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-6 cursor-pointer border border-border bg-transparent p-0"
        />
      </div>
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  mono = true,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  mono?: boolean
}) {
  const id = useId()
  const className = cn(
    'w-full border border-border bg-background px-2 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2',
    mono && 'font-mono',
  )
  return (
    <div className="flex flex-col gap-1.5">
      <Label id={id}>{label}</Label>
      {multiline ? (
        <textarea
          id={id}
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cn(className, 'resize-none')}
        />
      ) : (
        <input id={id} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={className} />
      )}
    </div>
  )
}

export function ChipRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | null
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <span id={id} className="text-xs text-muted-foreground">
        {label}
      </span>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-7 border px-2.5 text-[11px] tracking-wide uppercase transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2',
              value === o.value
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
