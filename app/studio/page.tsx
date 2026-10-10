import type { Metadata } from 'next'
import { OhMyAsciiStudio } from '@/components/studio/ohmyascii-studio'

export const metadata: Metadata = {
  title: 'ohmyascii studio',
  description:
    'The full ohmyascii editor: sources, looks, a world composer, a 3D modeller, AI generation, share links and code / PNG / video export.',
}

export default function Page() {
  return <OhMyAsciiStudio />
}
