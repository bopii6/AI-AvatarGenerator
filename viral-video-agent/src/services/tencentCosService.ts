import COS from 'cos-nodejs-sdk-v5'
import { randomUUID } from 'crypto'

export interface TencentCosConfig {
    secretId: string
    secretKey: string
    bucket: string
    region: string
    /** e.g. `voice-samples/` */
    prefix?: string
    signedUrlExpiresSeconds?: number
}

function safeTrim(input: unknown): string {
    return String(input ?? '').trim()
}

function normalizePrefix(prefix: string | undefined): string {
    const p = safeTrim(prefix)
    if (!p) return ''
    return p.endsWith('/') ? p : `${p}/`
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n)
}

function guessExt(fileName?: string): string {
    const name = safeTrim(fileName).toLowerCase()
    if (name.endsWith('.wav')) return 'wav'
    if (name.endsWith('.mp3')) return 'mp3'
    if (name.endsWith('.m4a')) return 'm4a'
    if (name.endsWith('.aac')) return 'aac'
    return 'wav'
}

function buildKey(basePrefix: string, deviceId: string | undefined, ext: string): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = pad2(now.getMonth() + 1)
    const d = pad2(now.getDate())
    const device = safeTrim(deviceId) || 'device'
    const id = randomUUID()
    const safeExt = ext.startsWith('.') ? ext : `.${ext}`
    return `${basePrefix}cosyvoice/${y}/${m}/${d}/${device}/${Date.now()}_${id}${safeExt}`
}

function getClient(config: TencentCosConfig): COS {
    const secretId = safeTrim(config.secretId)
    const secretKey = safeTrim(config.secretKey)
    if (!secretId || !secretKey) throw new Error('未配置腾讯云凭据（TENCENT_SECRET_ID/KEY）')
    return new COS({ SecretId: secretId, SecretKey: secretKey })
}

export async function uploadVoiceSampleToCos(
    config: TencentCosConfig,
    params: { buffer: Buffer; fileName?: string; deviceId?: string }
): Promise<{ bucket: string; region: string; key: string; signedUrl: string }> {
    const bucket = safeTrim(config.bucket)
    const region = safeTrim(config.region)
    if (!bucket) throw new Error('未配置 COS Bucket（TENCENT_COS_BUCKET）')
    if (!region) throw new Error('未配置 COS Region（TENCENT_COS_REGION）')

    const cos = getClient(config)
    const prefix = normalizePrefix(config.prefix || 'voice-samples/')
    const ext = guessExt(params.fileName)
    const key = buildKey(prefix, params.deviceId, ext)

    await new Promise<void>((resolve, reject) => {
        cos.putObject(
            {
                Bucket: bucket,
                Region: region,
                Key: key,
                Body: params.buffer,
                ContentType: ext === 'wav' ? 'audio/wav' : 'application/octet-stream',
            },
            (err) => {
                if (err) return reject(err)
                resolve()
            }
        )
    })

    const expires = config.signedUrlExpiresSeconds ?? 3600
    const signedUrl = cos.getObjectUrl({
        Bucket: bucket,
        Region: region,
        Key: key,
        Sign: true,
        Expires: expires,
    })

    return { bucket, region, key, signedUrl }
}

