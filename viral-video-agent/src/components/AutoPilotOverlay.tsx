import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react'

type TargetRefs = Record<string, RefObject<HTMLElement>>

export default function AutoPilotOverlay(props: {
    enabled: boolean
    targetKey: string
    targets: TargetRefs
    title?: string
    subtitle?: string
    pulseToken?: string | number
}) {
    const { enabled, targetKey, targets, title, subtitle, pulseToken } = props

    const targetEl = useMemo(() => {
        return targets?.[targetKey]?.current || null
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetKey, pulseToken, enabled])

    const [rect, setRect] = useState<DOMRect | null>(null)

    useLayoutEffect(() => {
        if (!enabled || !targetEl) {
            setRect(null)
            return
        }

        const update = () => {
            try {
                setRect(targetEl.getBoundingClientRect())
            } catch {
                setRect(null)
            }
        }

        update()

        let ro: ResizeObserver | null = null
        try {
            ro = new ResizeObserver(() => update())
            ro.observe(targetEl)
        } catch {
            ro = null
        }

        window.addEventListener('resize', update)
        window.addEventListener('scroll', update, true)
        const t = window.setInterval(update, 800)

        return () => {
            window.removeEventListener('resize', update)
            window.removeEventListener('scroll', update, true)
            window.clearInterval(t)
            try {
                ro?.disconnect()
            } catch {
                // ignore
            }
        }
    }, [enabled, targetEl])

    const cursorPos = useMemo(() => {
        if (!rect) return null
        const x = rect.left + Math.max(14, rect.width * 0.78)
        const y = rect.top + Math.max(10, rect.height * 0.55)
        return { x, y }
    }, [rect])

    const highlightStyle = useMemo(() => {
        if (!rect) return null
        const pad = 10
        return {
            left: Math.max(0, rect.left - pad),
            top: Math.max(0, rect.top - pad),
            width: Math.max(0, rect.width + pad * 2),
            height: Math.max(0, rect.height + pad * 2),
        } as const
    }, [rect])

    const [showClick, setShowClick] = useState(false)
    useEffect(() => {
        if (!enabled || !cursorPos) return
        setShowClick(true)
        const t = window.setTimeout(() => setShowClick(false), 560)
        return () => window.clearTimeout(t)
    }, [enabled, cursorPos?.x, cursorPos?.y, targetKey, pulseToken])

    if (!enabled) return null

    return (
        <div className="autopilot-overlay" aria-hidden>
            {highlightStyle && (
                <div className="autopilot-highlight" style={highlightStyle}>
                    <div className="autopilot-highlight-inner" />
                </div>
            )}

            <div className="autopilot-hud">
                <div className="autopilot-hud-title">{title || 'AI 自动驾驶演示'}</div>
                <div className="autopilot-hud-subtitle">{subtitle || '无需操作鼠标键盘，系统将自动完成整套流程'}</div>
            </div>

            {cursorPos && (
                <div
                    className="autopilot-cursor"
                    style={{
                        transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)`,
                    }}
                >
                    <div className="autopilot-cursor-core" />
                    {showClick && <div className="autopilot-click" />}
                </div>
            )}
        </div>
    )
}
