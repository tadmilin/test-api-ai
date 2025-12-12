'use client'

import { useEffect, useRef } from 'react'
import type { JobLog } from '@/hooks/useJobStatus'

interface LogViewerProps {
  logs: JobLog[]
  /** Auto-scroll to bottom when new logs arrive */
  autoScroll?: boolean
  /** Maximum height (default: 400px) */
  maxHeight?: string
  /** Show timestamp (default: true) */
  showTimestamp?: boolean
}

export function LogViewer({
  logs,
  autoScroll = true,
  maxHeight = '400px',
  showTimestamp = true,
}: LogViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400'
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400'
      case 'info':
      default:
        return 'text-blue-600 dark:text-blue-400'
    }
  }

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return '❌'
      case 'warning':
        return '⚠️'
      case 'info':
      default:
        return 'ℹ️'
    }
  }

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return timestamp
    }
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No logs yet...
      </div>
    )
  }

  return (
    <div
      className="overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
      style={{ maxHeight }}
    >
      <div className="p-4 font-mono text-sm space-y-1">
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded"
          >
            <span className="flex-shrink-0">{getLevelIcon(log.level)}</span>
            
            {showTimestamp && (
              <span className="flex-shrink-0 text-gray-500 dark:text-gray-400 text-xs">
                [{formatTime(log.timestamp)}]
              </span>
            )}
            
            <span className={getLevelColor(log.level)}>
              {log.message}
            </span>
          </div>
        ))}
        
        {/* Auto-scroll anchor */}
        <div ref={scrollRef} />
      </div>
    </div>
  )
}
