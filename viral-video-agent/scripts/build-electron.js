const esbuild = require('esbuild')
const path = require('path')
const dotenv = require('dotenv')
const fs = require('fs')

// 读取环境变量
const envPath = path.join(__dirname, '../.env')
const envConfig = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {}

// 定义要注入的变量
const defines = {
    // In dev we need main process to load Vite (http://localhost:5173).
    // In prod keep loading dist/index.html.
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
}

// 将 .env 中的关键变量注入（排除敏感或不必要的变量，但确保 ASR/TTS 所需的都进入）
const keysToInject = [
    'TENCENT_SECRET_ID',
    'TENCENT_SECRET_KEY',
    'ALIYUN_ACCESS_KEY_ID',
    'ALIYUN_ACCESS_KEY_SECRET',
    'ALIYUN_DASHSCOPE_API_KEY',
    'ALIYUN_COSYVOICE_MODEL',
    'COVER_PROVIDER',
    'COVER_TENCENT_REGION',
    'CLOUD_GPU_SERVER_URL',
    'CLOUD_GPU_VIDEO_PORT',
    'DIGITAL_HUMAN_API_URL',
    'DIGITAL_HUMAN_PYTHON'
]

keysToInject.forEach(key => {
    if (envConfig[key] || process.env[key]) {
        defines[`process.env.${key}`] = JSON.stringify(envConfig[key] || process.env[key])
    }
})

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
