import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import { GpuSchedulerProvider } from './contexts/GpuSchedulerContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ConfigProvider locale={zhCN}>
            <GpuSchedulerProvider pollingInterval={5000}>
                <App />
            </GpuSchedulerProvider>
        </ConfigProvider>
    </React.StrictMode>,
)
