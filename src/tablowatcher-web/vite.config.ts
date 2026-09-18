import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Built assets land directly in the API project's wwwroot, so ASP.NET Core
    // can serve the SPA and the REST API from the same host/port.
    outDir: '../TabloWatcherService.Api/wwwroot',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // During `npm run dev`, forward API calls to the ASP.NET Core dev server
      // instead of needing CORS on every request.
      '/api': {
        target: 'http://localhost:5080',
        changeOrigin: true,
      },
    },
  },
})
