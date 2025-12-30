const esbuild = require('esbuild')
const path = require('path')

// NOTE: Do not inline runtime secrets (API keys) into bundled output.
// The Electron main process loads `.env` at runtime and the app also persists config in userData.

const defines = {
    // In dev we need main process to load Vite (http://localhost:5173).
    // In prod keep loading dist/index.html.
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
}

async function build() {
    try {
        await esbuild.build({
            entryPoints: [path.join(__dirname, '../electron/main.ts')],
            bundle: true,
            platform: 'node',
            target: 'node16',
            outfile: path.join(__dirname, '../dist-electron/main.js'),
            external: ['electron', 'ffmpeg-static', 'playwright', 'canvas', 'cos-nodejs-sdk-v5'],
            loader: {
                '.ts': 'ts',
            },
            define: defines,
        })

        await esbuild.build({
            entryPoints: [path.join(__dirname, '../electron/preload.ts')],
            bundle: true,
            platform: 'node',
            target: 'node16',
            outfile: path.join(__dirname, '../dist-electron/preload.js'),
            external: ['electron'],
            loader: {
                '.ts': 'ts',
            },
        })

        console.log('Main process bundled successfully!')
    } catch (err) {
        console.error('Failed to bundle main process:', err)
        process.exit(1)
    }
}

build()