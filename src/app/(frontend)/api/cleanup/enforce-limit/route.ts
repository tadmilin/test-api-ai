import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { del } from '@vercel/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_JOBS = 50

/**
 * POST /api/cleanup/enforce-limit
 * ลบ jobs เก่าเมื่อเกิน 50 jobs (FIFO)
 */
export async function POST() {
  try {
    console.log('🔍 [Cleanup] Checking job count...')
    const payload = await getPayload({ config })

    // นับ jobs ทั้งหมด
    const { totalDocs } = await payload.find({
      collection: 'jobs',
      limit: 0,
    })

    console.log(`📊 [Cleanup] Total jobs: ${totalDocs}`)

    if (totalDocs <= MAX_JOBS) {
      console.log(`✅ [Cleanup] Within limit (${totalDocs}/${MAX_JOBS})`)
      return NextResponse.json({ 
        success: true, 
        message: 'Within limit',
        totalJobs: totalDocs,
        limit: MAX_JOBS,
        deleted: 0,
      })
    }

    // คำนวณจำนวนที่ต้องลบ
    const toDelete = totalDocs - MAX_JOBS
    console.log(`⚠️ [Cleanup] Over limit! Need to delete ${toDelete} jobs`)

    // หา jobs เก่าสุด
    const oldJobs = await payload.find({
      collection: 'jobs',
      sort: 'createdAt', // เก่าสุดก่อน
      limit: toDelete,
    })

    if (oldJobs.docs.length === 0) {
      console.log('⚠️ [Cleanup] No jobs found to delete')
      return NextResponse.json({ 
        success: true, 
        message: 'No jobs to delete',
        deleted: 0,
      })
    }

    console.log(`🗑️  [Cleanup] Deleting ${oldJobs.docs.length} oldest jobs...`)

    let deletedCount = 0
    let blobDeletedCount = 0
    const errors: string[] = []

    for (const job of oldJobs.docs) {
      try {
        console.log(`\n📦 [Cleanup] Processing job ${job.id} (${job.productName || 'Untitled'})`)

        // ✅ Step 1: ลบไฟล์ blob ทั้งหมด
        const blobUrls: string[] = []

        // รูป enhanced
        if (job.enhancedImageUrls && Array.isArray(job.enhancedImageUrls)) {
          for (const img of job.enhancedImageUrls) {
            if (img.url && typeof img.url === 'string' && img.url.includes('blob.vercel-storage.com')) {
              blobUrls.push(img.url)
            }
          }
        }

        // Template
        if (job.templateUrl && typeof job.templateUrl === 'string' && job.templateUrl.includes('blob.vercel-storage.com')) {
          blobUrls.push(job.templateUrl)
        }

        console.log(`   Found ${blobUrls.length} blob files to delete`)

        // ลบ blob files
        for (const url of blobUrls) {
          try {
            await del(url)
            blobDeletedCount++
            console.log(`   ✅ Deleted blob: ${url.substring(url.lastIndexOf('/') + 1)}`)
          } catch (blobError) {
            console.warn(`   ⚠️ Failed to delete blob ${url}:`, blobError)
            // ไม่ throw error เพราะอาจถูกลบไปแล้ว
          }
        }

        // ✅ Step 2: ลบ job-logs ที่เกี่ยวข้อง
        try {
          const logs = await payload.find({
            collection: 'job-logs',
            where: {
              jobId: {
                equals: job.id,
              },
            },
          })

          if (logs.totalDocs > 0) {
            for (const log of logs.docs) {
              await payload.delete({
                collection: 'job-logs',
                id: log.id,
              })
            }
            console.log(`   ✅ Deleted ${logs.totalDocs} job logs`)
          }
        } catch (logError) {
          console.warn(`   ⚠️ Failed to delete logs:`, logError)
        }

        // ✅ Step 3: ลบ job record
        await payload.delete({
          collection: 'jobs',
          id: job.id,
        })

        deletedCount++
        console.log(`   ✅ Job ${job.id} deleted successfully`)

      } catch (jobError) {
        const errorMsg = jobError instanceof Error ? jobError.message : 'Unknown error'
        console.error(`   ❌ Failed to delete job ${job.id}:`, errorMsg)
        errors.push(`Job ${job.id}: ${errorMsg}`)
      }
    }

    console.log(`\n✅ [Cleanup] Complete!`)
    console.log(`   Jobs deleted: ${deletedCount}/${oldJobs.docs.length}`)
    console.log(`   Blob files deleted: ${blobDeletedCount}`)
    
    if (errors.length > 0) {
      console.warn(`   ⚠️ Errors encountered: ${errors.length}`)
    }

    // ✅ Cleanup orphan template upscale predictions (stuck > 10 minutes)
    console.log(`\n🧹 [Cleanup] Checking for orphan template predictions...`)
    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      
      const orphanJobs = await payload.find({
        collection: 'jobs',
        where: {
          and: [
            {
              templateUpscalePredictionId: {
                exists: true,
              },
            },
            {
              updatedAt: {
                less_than: tenMinutesAgo,
              },
            },
          ],
        },
      })

      if (orphanJobs.docs.length > 0) {
        console.log(`   Found ${orphanJobs.docs.length} orphan template predictions`)
        
        for (const orphanJob of orphanJobs.docs) {
          await payload.update({
            collection: 'jobs',
            id: orphanJob.id,
            data: {
              templateUpscalePredictionId: null,
            } as any,
          })
          console.log(`   ✅ Cleared orphan prediction from job ${orphanJob.id}`)
        }
      } else {
        console.log(`   ✅ No orphan template predictions found`)
      }
    } catch (orphanError) {
      console.warn(`   ⚠️ Orphan cleanup failed:`, orphanError)
      // Don't fail the whole operation
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${deletedCount} old jobs`,
      deleted: deletedCount,
      blobsDeleted: blobDeletedCount,
      totalJobs: totalDocs,
      newTotal: totalDocs - deletedCount,
      limit: MAX_JOBS,
      errors: errors.length > 0 ? errors : undefined,
    })

  } catch (error) {
    console.error('❌ [Cleanup] Fatal error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Cleanup failed',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/cleanup/enforce-limit
 * ดูสถานะ storage และ cleanup
 */
export async function GET() {
  try {
    const payload = await getPayload({ config })

    // นับ jobs ทั้งหมด
    const { totalDocs } = await payload.find({
      collection: 'jobs',
      limit: 0,
    })

    // คำนวณ storage estimate (4.5 MB/job เฉลี่ย)
    const estimatedStorageMB = Math.round(totalDocs * 4.5)
    const storagePercent = Math.round((estimatedStorageMB / 1024) * 100)

    // เช็ค orphan template predictions
    const orphanJobs = await payload.find({
      collection: 'jobs',
      where: {
        templateUpscalePredictionId: {
          exists: true,
        },
      },
      limit: 0,
    })

    // สถานะ
    let status: 'healthy' | 'warning' | 'critical' = 'healthy'
    if (totalDocs > MAX_JOBS + 10) status = 'critical'
    else if (totalDocs > MAX_JOBS) status = 'warning'

    return NextResponse.json({
      success: true,
      totalJobs: totalDocs,
      limit: MAX_JOBS,
      usage: `${totalDocs}/${MAX_JOBS}`,
      usagePercent: Math.round((totalDocs / MAX_JOBS) * 100),
      estimatedStorageMB,
      storagePercent,
      orphanTemplatePredictions: orphanJobs.totalDocs,
      status,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    console.error('❌ [Cleanup Status] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get status',
      },
      { status: 500 }
    )
  }
}
