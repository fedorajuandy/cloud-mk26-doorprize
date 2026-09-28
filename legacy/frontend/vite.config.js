import { defineConfig, loadEnv } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const target = env.DEV_API_TARGET || 'http://127.0.0.1:6229'
  return {
    plugins: [solid(), tailwindcss()],
    server: {
      port: 5001,
      allowedHosts: [
        // This frontend tunnel is also explicitly allowed by the backend.
        'twghnmr6-5001.asse.devtunnels.ms',
        ...(env.DEV_ALLOWED_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean),
      ],
      proxy: {
        '/api': { target, changeOrigin: true, timeout: 0, proxyTimeout: 0 },
        '/socket.io': { target, changeOrigin: true, ws: true, timeout: 0, proxyTimeout: 0 },
      },
    },
  }
})
