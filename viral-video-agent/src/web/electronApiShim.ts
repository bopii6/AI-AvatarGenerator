import type { ElectronAPI } from '../types/electron'

type Listener = (...args: any[]) => void

function isElectronRuntime(): boolean {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) return true
    return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
}

function getApiBase(): string {
    const raw = (import.meta as any).env?.VITE_WEB_API_BASE as string | undefined
    const base = (raw && raw.trim()) ? raw.trim() : '/api'
    return base.endsWith('/') ? base.slice(0, -1) : base
}

function getWsUrl(clientId: string): string {
    const raw = (import.meta as any).env?.VITE_WEB_WS_URL as string | undefined
    if (raw && raw.trim()) return raw.trim().replace('{clientId}', encodeURIComponent(clientId))
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/ws?clientId=${encodeURIComponent(clientId)}`
}

function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = accept
        input.style.display = 'none'
        input.addEventListener('change', () => {
            const file = input.files && input.files[0] ? input.files[0] : null
            resolve(file)
            input.remove()
        })
        document.body.appendChild(input)
        input.click()
    })
}

async function uploadFile(file: File): Promise<{ filePath: string }> {
    const apiBase = getApiBase()
    const url = `${apiBase}/upload?filename=${encodeURIComponent(file.name)}`
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'X-Filename': file.name },
        body: file,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json?.success) {
        throw new Error(json?.error || `上传失败 (${res.status})`)
    }
    return { filePath: json.data.filePath as string }
}

function buildFileUrl(filePath: string): string {
    const apiBase = getApiBase()
    return `${apiBase}/file?path=${encodeURIComponent(filePath)}`
}

function triggerBrowserDownload(filePath: string, fileName?: string) {
    const url = buildFileUrl(filePath)
    const a = document.createElement('a')
    a.href = url
    if (fileName) a.download = fileName
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
}

export function ensureElectronApiShim() {
    if (isElectronRuntime()) return
    if (window.electronAPI?.invoke) return

    const apiBase = getApiBase()
    const clientId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`)

    const listeners = new Map<string, Set<Listener>>()
    let ws: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0

    const scheduleReconnect = () => {
        if (reconnectTimer != null) return
        const delay = Math.min(1000 * Math.max(1, reconnectAttempt + 1), 10000)
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null
            reconnectAttempt++
            ensureWs()
        }, delay)
    }

    const ensureWs = () => {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return ws
        try {
            ws = new WebSocket(getWsUrl(clientId))
        } catch {
            scheduleReconnect()
            return ws
        }
        ws.onopen = () => {
            reconnectAttempt = 0
        }
        ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(String(evt.data || '{}')) as { channel?: string; args?: unknown[] }
                const channel = String(msg.channel || '')
                if (!channel) return
                const args = Array.isArray(msg.args) ? msg.args : []
                const set = listeners.get(channel)
                if (!set) return
                for (const cb of Array.from(set)) {
                    try { cb(...args) } catch { /* ignore */ }
                }
            } catch {
                // ignore
            }
        }
        ws.onerror = () => {
            try { ws?.close() } catch { /* ignore */ }
            ws = null
            scheduleReconnect()
        }
        ws.onclose = () => {
            ws = null
            scheduleReconnect()
        }
        return ws
    }

    const on: ElectronAPI['on'] = (channel: string, callback: Listener) => {
        ensureWs()
        const key = String(channel || '')
        if (!listeners.has(key)) listeners.set(key, new Set())
        listeners.get(key)!.add(callback)
        return () => {
            const set = listeners.get(key)
            if (!set) return
            set.delete(callback)
        }
    }

    const off: ElectronAPI['off'] = (channel: string, callback: Listener) => {
        const key = String(channel || '')
        const set = listeners.get(key)
        if (!set) return
        set.delete(callback)
    }

    const invoke: ElectronAPI['invoke'] = async (channel: string, ...args: any[]) => {
        if (channel === 'select-audio-file') {
            const file = await pickFile('audio/*')
            if (!file) return { success: false, canceled: true }
            const uploaded = await uploadFile(file)
            return { success: true, filePath: uploaded.filePath }
        }

        if (channel === 'select-video-file') {
            const file = await pickFile('video/*')
            if (!file) return { success: false, canceled: true }
            const uploaded = await uploadFile(file)
            return { success: true, filePath: uploaded.filePath }
        }

        if (channel === 'save-to-desktop') {
            const payload = args?.[0] || {}
            const sourcePath = String(payload.sourcePath || '').trim()
            if (!sourcePath) return { success: false, error: 'sourcePath 为空' }
            const fileName = payload.fileName ? String(payload.fileName) : undefined
            triggerBrowserDownload(sourcePath, fileName)
            return { success: true }
        }

        if (channel === 'save-to-community') {
            const payload = args?.[0] || {}
            const sourcePath = String(payload.sourcePath || '').trim()
            if (!sourcePath) return { success: false, error: 'sourcePath 为空' }
            return { success: true, data: { destPath: sourcePath } }
        }

        const res = await fetch(`${apiBase}/invoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, args, clientId }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
            return { success: false, error: json?.error || `请求失败 (${res.status})` }
        }
        return json
    }

    const shim: ElectronAPI = {
        invoke,
        on,
        off,
        getAppPath: async () => invoke('get-app-path') as any,
        downloadVideo: async (url: string) => invoke('download-video', url) as any,
        transcribeAudio: async (audioPath: string) => invoke('transcribe-audio', audioPath) as any,
        generateSpeech: async (text: string, voiceId: string) => invoke('generate-speech', text, voiceId) as any,
        generateDigitalHuman: async (params: any) => invoke('generate-digital-human', params) as any,
        rewriteCopy: async (text: string, mode: string, instruction?: string) => invoke('rewrite-copy', text, mode, instruction) as any,
        generateCover: async (prompt: string) => invoke('generate-cover', prompt) as any,
        generateSubtitleFile: async (params: { segments?: Array<{ start: number; end: number; text: string }>; text?: string }) =>
            invoke('generate-subtitle-file', params) as any,
        getVideoDuration: async (videoPath: string) => invoke('get-video-duration', videoPath) as any,
        generateTitle: async (content: string) => invoke('generate-title', content) as any,
        onProgress: (callback: (progress: number, stage: string) => void) => {
            on('pipeline-progress', callback as any)
        },
        onDownloadProgress: (callback: (data: { percent: number; message: string }) => void) => {
            on('download-progress', callback as any)
        },
    }

    window.electronAPI = shim
}
