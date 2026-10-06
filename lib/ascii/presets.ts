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

function heart(): string {
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100"><path d="M50 88 C20 66 6 50 6 32 C6 18 17 8 30 8 C39 8 46 13 50 20 C54 13 61 8 70 8 C83 8 94 18 94 32 C94 50 80 66 50 88 Z" fill="#ffffff"/></svg>`,
  )
}

function hexagon(): string {
  const ring = (r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6
      return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
    }).join(' ')
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-100 -100 200 200"><polygon points="${ring(92)}" fill="#ffffff"/><polygon points="${ring(60)}" fill="#8a8a8a"/><polygon points="${ring(28)}" fill="#ffffff"/></svg>`,
  )
}

function star(): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 38 : 94
    const a = (Math.PI / 5) * i - Math.PI / 2
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
  }).join(' ')
  return toDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="-100 -100 200 200"><polygon points="${pts}" fill="#ffffff" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"/></svg>`,
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
      { key: 'heart', label: 'Heart', url: heart() },
      { key: 'hexagon', label: 'Hexagon', url: hexagon() },
      { key: 'star', label: 'Star', url: star() },
    ]
  }
  return cache
}
