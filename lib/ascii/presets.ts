function toDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function starburst(): string {
  const blades = 14
  const long: string[] = []
  const short: string[] = []
  for (let i = 0; i < blades; i++) {
    const a = (360 / blades) * i
    long.push(`<polygon points="16,-6 98,-1.2 22,7" fill="#ffffff" transform="rotate(${a})"/>`)
    short.push(
      `<polygon points="14,-9 58,-2 18,9" fill="#9a9a9a" transform="rotate(${a + 360 / blades / 2})"/>`,
    )
  }
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-100 -100 200 200">${short.join('')}${long.join('')}</svg>`,
  )
}

function spiral(): string {
  const pts: string[] = []
  const turns = 3.2
  const steps = 240
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const angle = t * turns * Math.PI * 2
    const r = 8 + t * 82
    pts.push(`${(Math.cos(angle) * r).toFixed(2)},${(Math.sin(angle) * r).toFixed(2)}`)
  }
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-100 -100 200 200"><polyline points="${pts.join(' ')}" fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  )
}

function rings(): string {
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-100 -100 200 200"><circle r="86" fill="none" stroke="#ffffff" stroke-width="12"/><circle r="58" fill="none" stroke="#b8b8b8" stroke-width="12" stroke-dasharray="70 22"/><circle r="30" fill="none" stroke="#ffffff" stroke-width="12"/><circle r="8" fill="#ffffff"/></svg>`,
  )
}

function bolt(): string {
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100"><polygon points="58,2 16,56 44,56 36,98 84,40 54,40 70,2" fill="#ffffff"/></svg>`,
  )
}

export interface SourcePreset {
  key: string
  label: string
  url: string
}

let cache: SourcePreset[] | null = null

export function getSourcePresets(): SourcePreset[] {
  if (!cache) {
    cache = [
      { key: 'starburst', label: 'Starburst', url: starburst() },
      { key: 'spiral', label: 'Spiral', url: spiral() },
      { key: 'rings', label: 'Rings', url: rings() },
      { key: 'bolt', label: 'Bolt', url: bolt() },
    ]
  }
  return cache
}
