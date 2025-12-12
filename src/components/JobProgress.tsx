'use client'

import { useState } from 'react'
import { useJobStatus } from '@/hooks/useJobStatus'
import { LogViewer } from './LogViewer'

interface JobProgressProps {
  jobId: string
  /** Show logs by default (default: false) */
  defaultExpanded?: boolean
}

export function JobProgress({ jobId, defaultExpanded = false }: JobProgressProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const { status, isLoading, error } = useJobStatus(jobId)

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-600 dark:text-red-400">❌ Error: {error}</p>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    )
  }

  const { progress, logs } = status
  const percentage = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1">
          {/* Progress Bar */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                📊 Progress
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {progress.completed}/{progress.total}
              </span>
            </div>
            
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2 text-sm">
            {progress.completed > 0 && (
              <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded">
                ✅ {progress.completed}
              </span>
            )}
            
            {progress.processing > 0 && (
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                🔄 {progress.processing}
              </span>
            )}
            
            {progress.failed > 0 && (
              <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">
                ❌ {progress.failed}
              </span>
            )}
          </div>
        </div>

        {/* Expand/Collapse Icon */}
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable Logs Section */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              📋 Live Logs
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {logs.length} entries
            </span>
          </div>
          
          <LogViewer 
            logs={logs} 
            autoScroll 
            maxHeight="300px"
          />
        </div>
      )}
    </div>
  )
}
