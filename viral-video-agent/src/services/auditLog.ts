type AuditPayload = Record<string, any>

export async function auditLog(eventType: string, payload: AuditPayload = {}) {
    const event = {
        ts: new Date().toISOString(),
        eventType,
        payload,
    }

    try {
        if (window.electronAPI?.invoke) {
            await window.electronAPI.invoke('audit-log', event)
            return
        }
    } catch {
        // ignore, fallback to local storage
    }

    try {
        const key = 'audit.log.local'
        const raw = localStorage.getItem(key)
        const arr = raw ? (JSON.parse(raw) as any[]) : []
        arr.push(event)
        // 保留最近 200 条，避免无限增长
        localStorage.setItem(key, JSON.stringify(arr.slice(-200)))
    } catch {
        // ignore
    }
}

