import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Project Pages site: https://ilias-el-jaafari.github.io/ghostnote/
export default defineConfig({
  plugins: [react()],
  base: '/ghostnote/',
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
