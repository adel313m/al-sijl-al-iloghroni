import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// إعدادات البناء الأساسية. لا توجد طبقة خادم حقيقي بعد؛
// كل شيء يعمل في المتصفح Serve + Storage Adapter.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // GitHub Pages لمشروع فرعي: VITE_BASE_PATH=/repo-name/ npm run build
  base: process.env.VITE_BASE_PATH || '/',
  server: { host: '0.0.0.0', port: 5173 },
});
