import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        strictPort: true,
        fs: {
            // 排除 HD_HUMAN 文件夹，避免 Gradio 依赖错误
            deny: ['**/HD_HUMAN/**'],
        },
    },
    // 排除 HD_HUMAN 文件夹
    optimizeDeps: {
        exclude: ['HD_HUMAN'],
    },
});
