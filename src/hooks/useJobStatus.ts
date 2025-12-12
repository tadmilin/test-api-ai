'use client'

import { useEffect, useState } from 'react'

export interface JobImage {
  index: number
  status: string
  url: string | null
  predictionId: string | null
  error: string | null
  canRetry: boolean
}

export interface JobLog {
  id: string
  timestamp: string
  level: string
  message: string
}

export interface JobProgress {
  total: number
  completed: number
  failed: number
  processing: number
}

export interface JobStatus {
  jobId: string
  status: string
  images: JobImage[]
  logs: JobLog[]
  progress: JobProgress
}

interface UseJobStatusOptions {
  /** Polling interval in ms (default: 2000) */
  interval?: number
  /** Auto-stop polling when job is complete (default: true) */
  autoStop?: boolean
  /** Enable polling (default: true) */
  enabled?: boolean
}

/**
 * Hook for polling job status and logs
 */
export function useJobStatus(
  jobId: string | null,
  options: UseJobStatusOptions = {}
) {
  const {
    interval = 2000,
    autoStop = true,
    enabled = true,
  } = options

  const [status, setStatus] = useState<JobStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!jobId || !enabled) return

    let isMounted = true
    let timeoutId: NodeJS.Timeout

    const fetchStatus = async () => {
      try {
        setIsLoading(true)
        const res = await fetch(`/api/jobs/${jobId}/status`)
        
        if (!res.ok) {
          throw new Error(`Failed to fetch status: ${res.status}`)
        }

        const data = await res.json()
        
        if (isMounted) {
          setStatus(data)
          setError(null)

          // Auto-stop polling if job is complete
          if (autoStop && (data.status === 'completed' || data.status === 'failed')) {
            return // Don't schedule next poll
          }

          // Schedule next poll
          timeoutId = setTimeout(fetchStatus, interval)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error')
          // Retry on error
          timeoutId = setTimeout(fetchStatus, interval)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    // Start polling
    fetchStatus()

    // Cleanup
    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [jobId, interval, autoStop, enabled])

  return {
    status,
    isLoading,
    error,
    /** Manually refresh status */
    refresh: async () => {
      if (!jobId) return
      try {
        const res = await fetch(`/api/jobs/${jobId}/status`)
        if (res.ok) {
          const data = await res.json()
          setStatus(data)
        }
      } catch (err) {
        console.error('Failed to refresh:', err)
      }
    },
  }
}
