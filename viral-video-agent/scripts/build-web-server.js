const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

async function build() {
    try {
        const outFile = path.join(__dirname, '../dist-web-server/server.js')
        fs.mkdirSync(path.dirname(outFile), { recursive: true })
        await esbuild.build({
            entryPoints: [path.join(__dirname, '../src/server/webServer.ts')],
            bundle: true,
            platform: 'node',
            target: 'node18',
            outfile: outFile,
            external: [
                'electron',
                'ffmpeg-static',
                'playwright',
                'cos-nodejs-sdk-v5',
            ],
            loader: {
                '.ts': 'ts',
            },
        })

        console.log('Web server bundled successfully!')
    } catch (err) {
        console.error('Failed to bundle web server:', err)
        process.exit(1)
    }
}

build()
