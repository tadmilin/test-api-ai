import { getPayload } from 'payload'
import config from '@payload-config'

export type LogLevel = 'info' | 'error' | 'warning'

/**
 * Write log entry to JobLogs collection
 */
export async function logToJob(
  jobId: string,
  level: LogLevel,
  message: string
): Promise<void> {
  try {
    const payload = await getPayload({ config })
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId,
        level,
        message,
        timestamp: new Date().toISOString(),
      },
    })
    // Also log to console
    const icon = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : 'ℹ️'
    console.log(`[${icon}] ${message}`)
  } catch (error) {
    console.error('Failed to write log:', error)
  }
}
