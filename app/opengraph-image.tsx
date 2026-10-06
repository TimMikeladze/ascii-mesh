import { ImageResponse } from 'next/og'

export const alt = 'ascii/mesh — turn any image, SVG or logo into a rotatable 3D ASCII animation'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const RAMP = ' .·:+*▲'

// A static ASCII starburst, matching the studio's default source.
function starburst(cols: number, rows: number): string[] {
  const lines: string[] = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < cols; x++) {
      const dx = (x - cols / 2) / (cols / 2)
      const dy = ((y - rows / 2) / (rows / 2)) * 1.1
      const r = Math.hypot(dx, dy)
      const blade = Math.pow(Math.abs(Math.cos(Math.atan2(dy, dx) * 7)), 6)
      const v = r > 1 || r < 0.12 ? 0 : blade * (1 - r) * 1.6
      line += RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))]
    }
    lines.push(line)
  }
  return lines
}

export default function Image() {
  const art = starburst(44, 22)
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#0f0f0f', color: '#e4e4e4', fontFamily: 'monospace', padding: 64 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 520 }}>
          <div style={{ fontSize: 44, letterSpacing: 2 }}>ascii/mesh</div>
          <div style={{ fontSize: 34, lineHeight: 1.3, color: '#bdbdbd' }}>Turn any image, SVG or logo into a rotatable 3D ASCII animation.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 'auto', fontSize: 20, lineHeight: 1.1, color: '#9a9a9a', whiteSpace: 'pre' }}>
          {art.map((l, i) => (
            <div key={i} style={{ display: 'flex' }}>{l}</div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
