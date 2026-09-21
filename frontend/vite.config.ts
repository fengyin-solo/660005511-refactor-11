import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    // shared/ 与后端共用同一份参数定义，显式放行避免依赖工作区 .git 自动探测
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:8000', '/ws': { target: 'ws://localhost:8000', ws: true } }
  }
})
