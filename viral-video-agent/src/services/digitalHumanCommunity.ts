export type DigitalHumanCommunityVideo = {
    id: string
    title: string
    avatarName?: string
    industry?: string
    sortOrder?: number
    createdAt: string
    sourcePath: string
    videoPath: string
}

const STORAGE_KEY = 'digitalHuman.community.v1'
const MAX_ITEMS = 200

function safeJsonParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback
    try {
        return JSON.parse(raw) as T
    } catch {
        return fallback
    }
}

export function loadDigitalHumanCommunity(): DigitalHumanCommunityVideo[] {
    try {
        const items = safeJsonParse<DigitalHumanCommunityVideo[]>(localStorage.getItem(STORAGE_KEY), [])
        if (!Array.isArray(items)) return []
        return items
            .filter(Boolean)
            .map((it) => ({
                id: String((it as any).id || ''),
                title: String((it as any).title || ''),
                avatarName: (it as any).avatarName ? String((it as any).avatarName) : undefined,
                industry: (it as any).industry ? String((it as any).industry) : undefined,
                sortOrder: typeof (it as any).sortOrder === 'number' ? (it as any).sortOrder : undefined,
                createdAt: String((it as any).createdAt || ''),
                sourcePath: String((it as any).sourcePath || ''),
                videoPath: String((it as any).videoPath || ''),
            }))
            .filter((it) => it.id && it.videoPath && it.sourcePath && it.createdAt)
            .slice(0, MAX_ITEMS)
    } catch {
        return []
    }
}

export function saveDigitalHumanCommunity(items: DigitalHumanCommunityVideo[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)))
    } catch {
        // ignore
    }
}

export function addDigitalHumanCommunityVideo(item: DigitalHumanCommunityVideo): DigitalHumanCommunityVideo[] {
    const items = loadDigitalHumanCommunity()
    const maxSortOrder = items.reduce((max, it) => Math.max(max, typeof it.sortOrder === 'number' ? it.sortOrder : 0), 0)
    const nextItem: DigitalHumanCommunityVideo = {
        ...item,
        sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : (maxSortOrder + 1),
    }
    const exists = items.some((it) => it.sourcePath === item.sourcePath || it.videoPath === item.videoPath)
    const next = exists
        ? items.map((it) => (it.sourcePath === nextItem.sourcePath ? { ...it, ...nextItem } : it))
        : [nextItem, ...items]
    const deduped: DigitalHumanCommunityVideo[] = []
    const seen = new Set<string>()
    for (const it of next) {
        const key = `${it.sourcePath}||${it.videoPath}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(it)
        if (deduped.length >= MAX_ITEMS) break
    }
    saveDigitalHumanCommunity(deduped)
    return deduped
}

export function updateDigitalHumanCommunityVideo(
    id: string,
    patch: Partial<Pick<DigitalHumanCommunityVideo, 'title' | 'avatarName' | 'industry' | 'sortOrder' | 'videoPath' | 'sourcePath' | 'createdAt'>>
): DigitalHumanCommunityVideo[] {
    const items = loadDigitalHumanCommunity()
    const next = items.map((it) => (it.id === id ? { ...it, ...patch } : it))
    saveDigitalHumanCommunity(next)
    return next
}

export function moveDigitalHumanCommunityVideo(id: string, direction: 'up' | 'down'): DigitalHumanCommunityVideo[] {
    const items = loadDigitalHumanCommunity()
    const sorted = [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const idx = sorted.findIndex((it) => it.id === id)
    if (idx < 0) return items
    const swapWith = direction === 'up' ? idx - 1 : idx + 1
    if (swapWith < 0 || swapWith >= sorted.length) return items
    const a = sorted[idx]
    const b = sorted[swapWith]
    const aOrder = a.sortOrder ?? idx
    const bOrder = b.sortOrder ?? swapWith
    a.sortOrder = bOrder
    b.sortOrder = aOrder
    const next = items.map((it) => {
        if (it.id === a.id) return { ...it, sortOrder: a.sortOrder }
        if (it.id === b.id) return { ...it, sortOrder: b.sortOrder }
        return it
    })
    saveDigitalHumanCommunity(next)
    return next
}

export function removeDigitalHumanCommunityVideo(id: string): DigitalHumanCommunityVideo[] {
    const items = loadDigitalHumanCommunity().filter((it) => it.id !== id)
    saveDigitalHumanCommunity(items)
    return items
}

export function clearDigitalHumanCommunity() {
    try {
        localStorage.removeItem(STORAGE_KEY)
    } catch {
        // ignore
    }
}
