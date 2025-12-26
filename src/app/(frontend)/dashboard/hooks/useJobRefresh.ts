/**
 * useJobRefresh Hook
 * Simple refresh without polling - webhook updates DB automatically
 */

import { useCallback } from 'react'

interface JobStatus {
  status: string
  images?: Array<{
    url?: string
    status?: string
    [key: string]: any
  }>
  templateUrl?: string
  summary?: {
    total: number
    completed: number
    pending: number
    failed: number
  }
}

interface UseJobRefreshProps {
  onStatusUpdate?: (status: JobStatus) => void
  onComplete?: (jobId: string, data: JobStatus) => void
  onError?: (error: string) => void
}

export function useJobRefresh({
  onStatusUpdate,
  onComplete,
  onError,
}: UseJobRefreshProps = {}) {
  
  const refreshJob = useCallback(async (jobId: string): Promise<JobStatus | null> => {
    try {
      console.log(`🔄 Refreshing job ${jobId}`)
      
      const statusRes = await fetch(`/api/generate/process/status?jobId=${jobId}`)
      
      if (!statusRes.ok) {
        const error = `Failed to fetch status: ${statusRes.statusText}`
        console.error(error)
        onError?.(error)
        return null
      }
      
      const statusData = await statusRes.json()
      
      // Notify status update
      onStatusUpdate?.(statusData)
      
      // Check if completed
      if (statusData.status === 'completed') {
        console.log(`✅ Job ${jobId} completed`)
        onComplete?.(jobId, statusData)
      } else if (statusData.status === 'enhancing' || statusData.status === 'processing') {
        console.log(`⏳ Job ${jobId} still processing (${statusData.summary?.completed}/${statusData.summary?.total})`)
      } else if (statusData.status === 'failed') {
        console.error(`❌ Job ${jobId} failed`)
        onError?.('Job processing failed')
      }
      
      return statusData
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Refresh failed'
      console.error('Refresh error:', error)
      onError?.(errorMsg)
      return null
    }
  }, [onStatusUpdate, onComplete, onError])
  
  return { refreshJob }
}
