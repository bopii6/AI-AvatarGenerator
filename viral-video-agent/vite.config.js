var _a;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    base: './',
    define: {
        __APP_VERSION__: JSON.stringify((_a = process.env.npm_package_version) !== null && _a !== void 0 ? _a : '0.0.0'),
        __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
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
