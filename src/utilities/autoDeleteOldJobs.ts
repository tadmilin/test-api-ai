import type { Payload } from 'payload'

/**
 * Auto-delete oldest jobs when limit is reached
 * This ensures MongoDB doesn't grow too large and Cloudinary storage is managed
 */

const MAX_JOBS = 300 // Maximum number of jobs to keep (6 users × 50 jobs/user)

/**
 * Check job count and delete oldest if over limit
 * @param payload - Payload instance
 * @param currentUserId - Current user ID (to avoid deleting their own jobs immediately)
 */
export async function autoDeleteOldJobs(payload: Payload, currentUserId?: string): Promise<void> {
  try {
    // Count total jobs
    const result = await payload.count({
      collection: 'jobs',
    })

    const totalCount = result.totalDocs

    console.log(`📊 Total jobs in database: ${totalCount}`)

    // If under limit, no need to delete
    if (totalCount < MAX_JOBS) {
      return
    }

    // Calculate how many to delete
    const toDelete = totalCount - MAX_JOBS + 1 // +1 to make room for new job

    console.log(`🗑️ Need to delete ${toDelete} oldest jobs (current: ${totalCount}, limit: ${MAX_JOBS})`)

    // Find oldest jobs
    const oldestJobs = await payload.find({
      collection: 'jobs',
      limit: toDelete,
      sort: 'createdAt', // Oldest first
      depth: 0, // Don't populate relationships
    })

    // Delete each job (afterDelete hook will clean up Cloudinary images)
    for (const job of oldestJobs.docs) {
      // Skip if this is the current user's job and it was just created
      if (job.id === currentUserId) {
        console.log(`⏭️ Skipping deletion of current user's job: ${job.id}`)
        continue
      }

      await payload.delete({
        collection: 'jobs',
        id: job.id,
      })

      console.log(`✅ Auto-deleted old job: ${job.id} (created: ${job.createdAt})`)
    }

    // Re-count to verify
    const finalResult = await payload.count({
      collection: 'jobs',
    })

    const newCount = finalResult.totalDocs

    console.log(`✅ Cleanup complete. Jobs remaining: ${newCount}/${MAX_JOBS}`)
  } catch (error: any) {
    console.error('❌ Auto-delete error:', error.message)
    // Don't throw - we don't want to fail job creation if cleanup fails
  }
}

/**
 * Get current job limit
 */
export function getJobLimit(): number {
  return MAX_JOBS
}

/**
 * Manual cleanup for admin use
 * Delete all jobs older than X days
 */
export async function deleteJobsOlderThan(payload: Payload, days: number): Promise<number> {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const oldJobs = await payload.find({
      collection: 'jobs',
      where: {
        createdAt: {
          less_than: cutoffDate.toISOString(),
        },
      },
      limit: 1000, // Safety limit
      depth: 0,
    })

    console.log(`🗑️ Found ${oldJobs.docs.length} jobs older than ${days} days`)

    let deleted = 0
    for (const job of oldJobs.docs) {
      await payload.delete({
        collection: 'jobs',
        id: job.id,
      })
      deleted++
    }

    console.log(`✅ Deleted ${deleted} old jobs`)
    return deleted
  } catch (error: any) {
    console.error('❌ Manual cleanup error:', error.message)
    throw error
  }
}
