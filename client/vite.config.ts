
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Lets `npm run dev` call /api on the local server without CORS issues.
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
