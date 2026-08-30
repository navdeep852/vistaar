import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { followUpSchedulerPlugin } from './server/vitePlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    followUpSchedulerPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 3005,
    host: true,
    open: false,
    watch: {
      ignored: ['**/data/**', '**/.data/**', '**/data/store.json'],
    },
  },
})
