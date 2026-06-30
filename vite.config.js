import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'firebase/firestore': path.resolve(__dirname, './src/rxfs.js'),
      'firebase/database': path.resolve(__dirname, './src/rxrtdb.js'),
      'firebase/functions': path.resolve(__dirname, './src/rxfunctions.js'),
      'firebase/storage': path.resolve(__dirname, './src/rxstorage.js')
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['vite.svg'],
      manifest: {
        name: 'QuickAccPro v1.5',
        short_name: 'QuickAccPro',
        description: 'Lightweight companion for AccountsPro',
        theme_color: '#1e1b4b',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cashshams\.web\.app\/accproApi.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    open: true
  }
})
