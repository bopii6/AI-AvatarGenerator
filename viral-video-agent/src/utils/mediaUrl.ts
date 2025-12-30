function isElectronRuntime(): boolean {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) return true
    return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
}

function getApiBase(): string {
    const raw = (import.meta as any).env?.VITE_WEB_API_BASE as string | undefined
    const base = (raw && raw.trim()) ? raw.trim() : '/api'
    return base.endsWith('/') ? base.slice(0, -1) : base
}

export function toMediaUrl(pathOrUrl: string): string {
    const input = (pathOrUrl || '').trim()
    if (!input) return ''

    if (/^(https?:)?\/\//i.test(input) || input.startsWith('blob:') || input.startsWith('data:')) {
        return input
    }

    if (!isElectronRuntime()) {
        const apiBase = getApiBase()
        return `${apiBase}/file?path=${encodeURIComponent(input)}`
    }

    let filePath = input
    if (filePath.startsWith('file://')) filePath = filePath.slice(7)
    const normalizedPath = filePath.replace(/\\/g, '/')
    const segments = normalizedPath.split('/')
    const encoded = segments
        .map((segment, idx) => {
            // Windows drive letter segment like "C:" must keep ":" unescaped for file:///C:/... URLs
            if (idx === 0 && /^[A-Za-z]:$/.test(segment)) return segment
            return encodeURIComponent(segment)
        })
        .join('/')
    return `file:///${encoded.replace(/^\/+/, '')}`
}
