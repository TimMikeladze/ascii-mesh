import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Mirrors tsconfig's "@/*" -> "./*" so component files (which follow the shadcn registry's `@/`
// import convention) can be tested directly.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
