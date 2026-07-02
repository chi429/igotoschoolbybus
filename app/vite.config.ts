import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages project site 會由 CI 傳入 e.g. "/my-repo/"
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/Cubic_11.woff2', 'apple-touch-icon.png'],
      workbox: {
        // 路線/車站快照都 cache 埋，離線都開到 app（ETA 就梗係要網啦）
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: '搭咩巴士',
        short_name: '搭咩巴士',
        description: '香港巴士點對點 ETA — 冇廣告',
        lang: 'zh-HK',
        display: 'standalone',
        background_color: '#FFF6E3',
        theme_color: '#FFF6E3',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
