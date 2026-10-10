import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist_Mono, IBM_Plex_Mono, JetBrains_Mono, Space_Mono } from 'next/font/google'
import './globals.css'

const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' })
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-space', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-plex', display: 'swap' })

export const metadata: Metadata = {
  title: 'ohmyascii — describe a scene, watch it render in ASCII',
  description:
    'Chat an animated ASCII world into existence — or start from a creation in the gallery. A studio and React component for turning photos, SVGs, logos and 3D scenes into rotatable ASCII renders.',
  metadataBase: new URL(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
  openGraph: {
    title: 'ohmyascii',
    description: 'Describe a scene — get a live, rotatable ASCII world. Or start from the gallery.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'ohmyascii', description: 'Describe a scene — get a live, rotatable ASCII world.' },
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
