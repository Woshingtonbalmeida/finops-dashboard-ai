import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        // Standalone entry point for embedding the app as a Microsoft Teams tab — kept
        // outside the main SPA bundle/router so the normal app is untouched by this.
        teamsTab: resolve(__dirname, 'teams-tab.html'),
      },
    },
  },
})
