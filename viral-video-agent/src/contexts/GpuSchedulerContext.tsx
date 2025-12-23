/**
 * GPU 调度器 React Context
 * 
 * 提供全局的调度器状态访问，包括：
 * - 实时状态轮询
 * - 预热服务
 * - 切换进度计算
 * 
 * 使用方式：
 * 1. 在 App.tsx 中包裹 <GpuSchedulerProvider>
 * 2. 在组件中使用 useGpuScheduler() hook
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import {
    SchedulerStatus,
    ServiceType,
    PreswitchResult,
    calculateSwitchProgress,
    getServiceDisplayName,
} from '../services/gpuSchedulerService'

interface GpuSchedulerContextValue {
    /** 当前调度器状态 */
    status: SchedulerStatus | null
    /** 状态是否正在加载 */
    loading: boolean
    /** 检查指定服务是否就绪（当前正在运行或调度器在线可切换） */
    isReady: (service: ServiceType) => boolean
    /** 检查指定服务是否正在运行 */
    isRunning: (service: ServiceType) => boolean
    /** 预热服务（后台异步切换） */
    preswitch: (service: ServiceType) => Promise<PreswitchResult | null>
    pendingSwitch: { targetService: ServiceType; startedAt: number } | null
    /** 清除 pendingSwitch 状态（用于超时或取消） */
    clearPendingSwitch: () => void
    /** 获取切换进度 */
    getSwitchProgress: () => { percent: number; remainingSeconds: number }
    /** 获取服务显示名称 */
    getServiceName: (service: ServiceType) => string
    /** 刷新状态 */
    refresh: () => Promise<void>
}

const defaultContext: GpuSchedulerContextValue = {
    status: null,
    loading: true,
    isReady: () => false,
    isRunning: () => false,
    preswitch: async () => null,
    pendingSwitch: null,
    clearPendingSwitch: () => { },
    getSwitchProgress: () => ({ percent: 0, remainingSeconds: 0 }),
    getServiceName: () => '',
    refresh: async () => { },
}

const GpuSchedulerContext = createContext<GpuSchedulerContextValue>(defaultContext)

export function useGpuScheduler() {
    return useContext(GpuSchedulerContext)
}

interface GpuSchedulerProviderProps {
    children: React.ReactNode
    /** 轮询间隔（毫秒），默认 3000 */
    pollingInterval?: number
}

export function GpuSchedulerProvider({ children, pollingInterval = 3000 }: GpuSchedulerProviderProps) {
    const [status, setStatus] = useState<SchedulerStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [pendingSwitch, setPendingSwitch] = useState<{ targetService: ServiceType; startedAt: number } | null>(null)
    const intervalRef = useRef<number | null>(null)
    const inFlightRef = useRef(false)
    const pendingTargetRef = useRef<ServiceType | null>(null)
    const pendingSwitchRef = useRef<{ targetService: ServiceType; startedAt: number } | null>(null)
    const consecutiveFailuresRef = useRef(0)
    const lastOkAtRef = useRef<number | null>(null)
    const lastGoodStatusRef = useRef<SchedulerStatus | null>(null)

    useEffect(() => {
        pendingSwitchRef.current = pendingSwitch
    }, [pendingSwitch])

    const fetchStatus = useCallback(async () => {
        if (inFlightRef.current) {
            return
        }
        inFlightRef.current = true
        try {
            const result = await window.electronAPI?.invoke('scheduler-get-status')
            if (result?.success && result.data) {
                const next: SchedulerStatus = {
                    currentService: result.data.current_service,
                    switching: result.data.switching,
                    switchingTarget: result.data.switching_target,
                    switchingStartedAt: result.data.switching_started_at,
                    estimatedRemainingSeconds: result.data.estimated_remaining_seconds,
                    queueSize: result.data.queue_size ?? 0,
                    online: true,
                    unstable: false,
                    servicesHealth: result.data.services_health ?? { cosyvoice: false, duix: false },
                }
                consecutiveFailuresRef.current = 0
                lastOkAtRef.current = Date.now()
                lastGoodStatusRef.current = next
                setStatus(next)

                const pending = pendingSwitchRef.current
                if (pending && !next.switching && next.currentService === pending.targetService) {
                    setPendingSwitch(null)
                }
            } else {
                const errorMessage = result?.error || '无法连接调度器'
                const now = Date.now()
                consecutiveFailuresRef.current += 1

                // 检测 API 密钥错误（立即响应，不走 grace period）
                const isApiKeyError = errorMessage.includes('401') ||
                    errorMessage.toLowerCase().includes('api key') ||
                    errorMessage.includes('密钥')
                if (isApiKeyError) {
                    setPendingSwitch(null)  // 立即清除切换状态
                    setStatus({
                        currentService: null,
                        switching: false,
                        queueSize: 0,
                        online: false,
                        unstable: false,
                        servicesHealth: { cosyvoice: false, duix: false },
                        error: 'API 密钥无效，请在设置中检查密钥',
                        apiKeyError: true,
                    })
                    return
                }

                const lastOkAt = lastOkAtRef.current
                const lastGood = lastGoodStatusRef.current
                const graceMs = lastGood?.switching ? 240_000 : 180_000
                const withinGrace = lastOkAt != null && (now - lastOkAt) < graceMs
                const shouldMarkUnstable = consecutiveFailuresRef.current >= 2

                if (withinGrace && lastGood) {
                    setStatus({
                        ...lastGood,
                        online: true,
                        unstable: shouldMarkUnstable,
                        error: shouldMarkUnstable ? errorMessage : undefined,
                    })
                } else {
                    setStatus({
                        currentService: null,
                        switching: false,
                        queueSize: 0,
                        online: false,
                        unstable: false,
                        servicesHealth: { cosyvoice: false, duix: false },
                        error: errorMessage,
                    })
                }
            }
        } catch (e: any) {
            const errorMessage = e?.message || '调度器状态获取失败'
            const now = Date.now()
            consecutiveFailuresRef.current += 1

            const lastOkAt = lastOkAtRef.current
            const lastGood = lastGoodStatusRef.current
            const graceMs = lastGood?.switching ? 240_000 : 180_000
            const withinGrace = lastOkAt != null && (now - lastOkAt) < graceMs
            const shouldMarkUnstable = consecutiveFailuresRef.current >= 2

            if (withinGrace && lastGood) {
                setStatus({
                    ...lastGood,
                    online: true,
                    unstable: shouldMarkUnstable,
                    error: shouldMarkUnstable ? errorMessage : undefined,
                })
            } else {
                setStatus({
                    currentService: null,
                    switching: false,
                    queueSize: 0,
                    online: false,
                    unstable: false,
                    servicesHealth: { cosyvoice: false, duix: false },
                    error: errorMessage,
                })
            }
        } finally {
            setLoading(false)
            inFlightRef.current = false
        }
    }, [])

    // 初始加载和轮询
    useEffect(() => {
        fetchStatus()

        intervalRef.current = window.setInterval(fetchStatus, pollingInterval)

        return () => {
            if (intervalRef.current) {
                window.clearInterval(intervalRef.current)
            }
        }
    }, [fetchStatus, pollingInterval])

    useEffect(() => {
        if (!status?.switching) {
            pendingTargetRef.current = null
        } else if (status.switchingTarget) {
            pendingTargetRef.current = status.switchingTarget
        }
    }, [status?.switching, status?.switchingTarget])

    const isReady = useCallback((service: ServiceType): boolean => {
        if (!status?.online || status.unstable || !service) return false
        // 调度器在线就是就绪的（可能需要切换）
        return true
    }, [status])

    const isRunning = useCallback((service: ServiceType): boolean => {
        if (!status?.online || status.unstable || !service) return false
        return status.currentService === service
    }, [status])

    const preswitch = useCallback(async (service: ServiceType): Promise<PreswitchResult | null> => {
        if (!service) return null
        if (!status?.online) {
            return { success: false, message: '调度器未连接' }
        }
        if (status.unstable) {
            return { success: false, message: '调度器连接不稳定，正在重试，请稍候…' }
        }
        if (status.currentService === service) {
            if (pendingSwitch?.targetService === service) {
                setPendingSwitch(null)
            }
            return { success: true, noSwitchNeeded: true, targetService: service }
        }
        if (status.switching) {
            if (status.switchingTarget === service) {
                return { success: true, inProgress: true, targetService: service }
            }
            return { success: false, message: '调度器正在切换其他服务，请稍候' }
        }
        if (pendingSwitch?.targetService === service) {
            return { success: true, inProgress: true, targetService: service }
        }
        if (pendingTargetRef.current === service) {
            return { success: true, inProgress: true, targetService: service }
        }

        pendingTargetRef.current = service
        setPendingSwitch({ targetService: service, startedAt: Date.now() })
        try {
            const result = await window.electronAPI?.invoke('scheduler-preswitch', service)
            if (result?.success) {
                // 切换开始后刷新状态
                setTimeout(fetchStatus, 500)
                if (result.data?.no_switch_needed) {
                    setPendingSwitch(null)
                }
                return {
                    success: true,
                    message: result.data?.message,
                    noSwitchNeeded: result.data?.no_switch_needed,
                    inProgress: result.data?.in_progress,
                    started: result.data?.started,
                    targetService: result.data?.target_service,
                    estimatedRemainingSeconds: result.data?.estimated_remaining_seconds,
                }
            }
            pendingTargetRef.current = null
            setPendingSwitch(null)
            return { success: false, message: result?.error }
        } catch (e: any) {
            pendingTargetRef.current = null
            setPendingSwitch(null)
            return { success: false, message: e?.message }
        }
    }, [fetchStatus, pendingSwitch, status])

    const getSwitchProgress = useCallback(() => {
        if (!status) return { percent: 0, remainingSeconds: 0 }
        return calculateSwitchProgress(status)
    }, [status])

    const getServiceName = useCallback((service: ServiceType) => {
        return getServiceDisplayName(service)
    }, [])

    const clearPendingSwitch = useCallback(() => {
        pendingTargetRef.current = null
        setPendingSwitch(null)
    }, [])

    const value: GpuSchedulerContextValue = {
        status,
        loading,
        isReady,
        isRunning,
        preswitch,
        pendingSwitch,
        clearPendingSwitch,
        getSwitchProgress,
        getServiceName,
        refresh: fetchStatus,
    }

    return (
        <GpuSchedulerContext.Provider value={value}>
            {children}
        </GpuSchedulerContext.Provider>
    )
}

export default GpuSchedulerContext
