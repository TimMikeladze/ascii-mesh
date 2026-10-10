import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist_Mono, IBM_Plex_Mono, JetBrains_Mono, Space_Mono } from 'next/font/google'
import './globals.css'

const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' })
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-space', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-plex', display: 'swap' })

export const metadata: Metadata = {
  title: 'ohmyascii — turn any image, SVG or logo into a 3D ASCII animation',
  description:
    'A studio and React component for turning photos, SVGs, logos and text into rotatable, fully customizable animated ASCII 3D renders.',
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
  openGraph: {
    title: 'ohmyascii',
    description: 'Turn any image, SVG or logo into a rotatable 3D ASCII animation.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'ohmyascii', description: 'Turn any image, SVG or logo into a rotatable 3D ASCII animation.' },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0f0f0f',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${jetbrains.variable} ${spaceMono.variable} ${plexMono.variable} bg-background`}
    >
      <body className="font-mono antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
