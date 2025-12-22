import { message } from 'antd'

export function isServiceSwitchingError(err: any): boolean {
    const raw = (err?.message || err?.error || err || '').toString().toLowerCase()
    return (
        raw.includes('service switching') ||
        raw.includes('switching in progress') ||
        raw.includes('http 503') ||
        raw.includes('503')
    )
}

export function startServiceSwitchingHint(actionLabel: string, delayMs: number = 2500): () => void {
    const key = `service-switching-${Date.now()}-${Math.random().toString(16).slice(2)}`
    let timer: number | undefined

    timer = window.setTimeout(() => {
        message.loading({
            key,
            duration: 0,
            content: `${actionLabel}：云端服务正在准备中…（单卡省显存模式会在「声音/视频」之间自动切换，通常需要 30–120 秒）`,
        })
    }, delayMs)

    return () => {
        if (timer) window.clearTimeout(timer)
        message.destroy(key)
    }
}

