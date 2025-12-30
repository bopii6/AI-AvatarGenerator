import { LEGAL_DISCLAIMER_VERSION } from '../legal/disclaimer'
import { auditLog } from './auditLog'

export type LegalConsentStatus = {
    accepted: boolean
    version: string
    acceptedAt?: string
    deviceId?: string
    source: 'electron' | 'localStorage'
}

const LOCAL_KEY = 'legal.consent'

export async function getLegalConsentStatus(): Promise<LegalConsentStatus> {
    try {
        if (window.electronAPI?.invoke) {
            const res = await window.electronAPI.invoke('legal-consent-get')
            if (res?.success) {
                return {
                    accepted: !!res.data?.accepted,
                    version: String(res.data?.version || LEGAL_DISCLAIMER_VERSION),
                    acceptedAt: res.data?.acceptedAt ? String(res.data.acceptedAt) : undefined,
                    deviceId: res.data?.deviceId ? String(res.data.deviceId) : undefined,
                    source: 'electron',
                }
            }
        }
    } catch {
        // ignore and fallback
    }

    try {
        const raw = localStorage.getItem(LOCAL_KEY)
        const parsed = raw ? JSON.parse(raw) : null
        const acceptedAt = typeof parsed?.acceptedAt === 'string' ? parsed.acceptedAt : undefined
        const version = typeof parsed?.version === 'string' ? parsed.version : LEGAL_DISCLAIMER_VERSION
        return {
            accepted: !!acceptedAt && version === LEGAL_DISCLAIMER_VERSION,
            version,
            acceptedAt,
            source: 'localStorage',
        }
    } catch {
        return { accepted: false, version: LEGAL_DISCLAIMER_VERSION, source: 'localStorage' }
    }
}

export async function acceptLegalConsent(extra?: Record<string, any>): Promise<void> {
    const payload = {
        version: LEGAL_DISCLAIMER_VERSION,
        ...extra,
    }

    try {
        if (window.electronAPI?.invoke) {
            const res = await window.electronAPI.invoke('legal-consent-accept', payload)
            if (!res?.success) throw new Error(res?.error || '保存同意记录失败')
            return
        }
    } catch {
        // ignore and fallback
    }

    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify({ version: LEGAL_DISCLAIMER_VERSION, acceptedAt: new Date().toISOString() }))
    } catch {
        // ignore
    }

    // 兜底：即使不在 Electron，也留一条本地审计记录
    await auditLog('legal_consent_accept', payload)
}

