import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/config':      'http://localhost:8001',
      '/images':      'http://localhost:8001',
      '/image':       'http://localhost:8001',
      '/predict':     'http://localhost:8001',
      '/save':        'http://localhost:8001',
      '/annotations': 'http://localhost:8001',
      '/annotation':  'http://localhost:8001',
      '/export':      'http://localhost:8001',
      '/browse':           'http://localhost:8001',
      '/csv-annotations':   'http://localhost:8001',
      '/annotation-counts':  'http://localhost:8001',
      '/save-csv-batch':          'http://localhost:8001',
      '/auto-annotate-points':   'http://localhost:8001',
    },
  },
})
