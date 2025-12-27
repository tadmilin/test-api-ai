import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { handleTextToImage, handleCustomPrompt, handleTemplateMerge } from './handlers'
import { verifyWebhookSignature } from './verifyWebhook'

// Force Node.js runtime
export const runtime = 'nodejs'

// Types for webhook processing
interface ReplicateWebhookBody {
  status: string
  output?: unknown
  error?: string
  logs?: string
}

interface EnhancedImage {
  index?: number
  status?: 'pending' | 'completed' | 'failed' | 'approved' | 'regenerating' | null
  url?: string | null
  predictionId?: string | null
  upscalePredictionId?: string | null
  originalUrl?: string | null
  tempOutputUrl?: string | null
  webhookFailed?: boolean | null
  id?: string | null
}

interface TemplateGeneration {
  predictionId?: string | null
  upscalePredictionId?: string | null
  url?: string | null
  status?: string
}

interface JobDoc {
  id: string
  _id?: unknown
  status: string
  jobType?: string
  enhancedImageUrls?: EnhancedImage[] | null
  templateGeneration?: TemplateGeneration
  templatePredictionId?: string | null
  templateUrl?: string | null
}

interface HandlerResult {
  updatedUrls?: EnhancedImage[] | null
  newJobStatus?: string | null
  templateUpdate?: Partial<TemplateGeneration>
  templateUrl?: string | null
}

/**
 * Process webhook in background
 */
async function processWebhook(rawBody: string, predictionId: string) {
  try {
    const body = JSON.parse(rawBody)
    const payload = await getPayload({ config: configPromise })

    const { status, output, error: replicateError, logs } = body

    console.log('[Webhook] ========== Processing Webhook ==========')
    console.log('[Webhook] Prediction ID:', predictionId)
    console.log('[Webhook] Status:', status)
    console.log('[Webhook] Output:', output)
    if (replicateError) console.error('[Webhook] Error:', replicateError)
    if (logs) console.log('[Webhook] Logs:', logs)
    console.log('[Webhook] =============================================')

    //  Find Job
    console.log('[Webhook] 🔍 Searching for job with prediction:', predictionId)
    
    // Try standard query first
    let jobs = await payload.find({
      collection: 'jobs',
      where: {
        or: [
          { 'enhancedImageUrls.predictionId': { equals: predictionId } },
          { 'enhancedImageUrls.upscalePredictionId': { equals: predictionId } },
          { 'templateGeneration.predictionId': { equals: predictionId } },
          { 'templateGeneration.upscalePredictionId': { equals: predictionId } },
          { 'templatePredictionId': { equals: predictionId } }, // ✅ Top-level fallback
        ],
      },
      limit: 1,
    })
    
    console.log('[Webhook] 📊 Query result:', {
      found: jobs.docs.length,
      totalDocs: jobs.totalDocs,
      predictionId,
    })

    // If not found, search in enhancing/processing jobs manually
    if (jobs.docs.length === 0) {
      console.log('[Webhook] 🔍 Standard query failed, trying MongoDB direct query...')
      
      // ✅ Use MongoDB direct query to bypass Payload cache
      const JobModel = (payload.db as { collections: Record<string, unknown> }).collections['jobs'] as {
        find: (query: unknown) => { limit: (n: number) => { lean: () => { exec: () => Promise<JobDoc[]> } } }
      }
      const enhancingJobsDocs = await JobModel.find({
        status: { $in: ['enhancing', 'processing', 'generating_template'] }
      }).limit(100).lean().exec()
      
      console.log(`[Webhook] 🔍 MongoDB found ${enhancingJobsDocs.length} jobs`)
      
      // ✅ Log first job to see field structure
      if (enhancingJobsDocs.length > 0) {
        const firstJob = enhancingJobsDocs[0]
        console.log('[Webhook] 🔍 First job structure:')
        console.log('[Webhook]    _id:', firstJob._id)
        console.log('[Webhook]    status:', firstJob.status)
        console.log('[Webhook]    jobType:', firstJob.jobType)
        console.log('[Webhook]    enhancedImageUrls length:', firstJob.enhancedImageUrls?.length || 0)
        if (firstJob.enhancedImageUrls && firstJob.enhancedImageUrls.length > 0) {
          console.log('[Webhook]    First image:', {
            index: firstJob.enhancedImageUrls[0].index,
            predictionId: firstJob.enhancedImageUrls[0].predictionId,
            upscalePredictionId: firstJob.enhancedImageUrls[0].upscalePredictionId,
          })
        }
      }
      
      const enhancingJobs = {
        docs: enhancingJobsDocs.map((doc: JobDoc) => ({
          ...doc,
          id: doc._id?.toString() || '', // ✅ Map _id to id
        })),
        totalDocs: enhancingJobsDocs.length
      }

      console.log('[Webhook] 🔍 Found', enhancingJobs.docs.length, 'jobs with status enhancing/processing/generating_template')
      
      // Debug: แสดงทุก job ที่เจอ
      if (enhancingJobs.docs.length > 0) {
        console.log('[Webhook] 🔍 Checking jobs:')
        enhancingJobs.docs.forEach((j: JobDoc, idx: number) => {
          console.log(`[Webhook]   [${idx}] Job ${j.id}:`)
          console.log(`[Webhook]       status: ${j.status}`)
          console.log(`[Webhook]       jobType: ${j.jobType}`)
          console.log(`[Webhook]       templateGeneration:`, {
            predictionId: j.templateGeneration?.predictionId || 'none',
            upscalePredictionId: j.templateGeneration?.upscalePredictionId || 'none',
          })
          console.log(`[Webhook]       looking for: ${predictionId}`)
        })
      }
      
      const found = enhancingJobs.docs.find((job: JobDoc) => {
        // Check enhancedImageUrls
        if (job.enhancedImageUrls) {
          console.log(`[Webhook] 🔍 Job ${job.id} has ${job.enhancedImageUrls.length} images:`)
          job.enhancedImageUrls.forEach((img: EnhancedImage, idx: number) => {
            console.log(`[Webhook]    [${idx}] index=${img.index}, predictionId=${img.predictionId || 'null'}, upscalePredictionId=${img.upscalePredictionId || 'null'}`)
          })
          
          for (const img of job.enhancedImageUrls) {
            if (img.predictionId === predictionId || img.upscalePredictionId === predictionId) {
              console.log('[Webhook] 🎯 Found match in enhancedImageUrls for job:', job.id)
              return true
            }
          }
        }
        // Check templateGeneration
        if (job.templateGeneration) {
          if (job.templateGeneration.predictionId === predictionId || 
              job.templateGeneration.upscalePredictionId === predictionId) {
            console.log('[Webhook] 🎯 Found match in templateGeneration for job:', job.id)
            console.log('[Webhook]    Job status:', job.status)
            console.log('[Webhook]    Job type:', job.jobType)
            console.log('[Webhook]    Template predictionId:', job.templateGeneration.predictionId)
            console.log('[Webhook]    Template upscalePredictionId:', job.templateGeneration.upscalePredictionId)
            return true
          }
        }
        // Check legacy templatePredictionId
        if (job.templatePredictionId === predictionId) {
          console.log('[Webhook] 🎯 Found match in templatePredictionId (legacy) for job:', job.id)
          return true
        }
        return false
      })

      if (found) {
        console.log('[Webhook] ✅ Manual search found job:', found.id)
        jobs = { docs: [found] } as typeof jobs
      } else {
        console.log('[Webhook] ❌ Manual search failed')
      }
    }

    console.log('[Webhook] 🔍 Jobs found:', jobs.docs.length)
    if (jobs.docs.length > 0) {
      console.log('[Webhook] 🔍 First job:', {
        id: jobs.docs[0].id,
        jobType: jobs.docs[0].jobType,
        imageCount: jobs.docs[0].enhancedImageUrls?.length || 0,
      })
    }

    if (jobs.docs.length === 0) {
      console.log('[Webhook] ⚠️ No job found for prediction:', predictionId)
      console.log('[Webhook] 💡 This might be an upscale webhook - checking all jobs...')
      
      // Debug: ดูทุก job ที่มี enhancing status
      const allEnhancing = await payload.find({
        collection: 'jobs',
        where: { status: { equals: 'enhancing' } },
        limit: 5,
      })
      console.log('[Webhook] 🔍 All enhancing jobs:', allEnhancing.docs.map(j => ({
        id: j.id,
        images: (j.enhancedImageUrls || []).map(img => ({
          predictionId: img.predictionId,
          upscalePredictionId: img.upscalePredictionId,
        }))
      })))
      
      return
    }

    const job = jobs.docs[0]
    console.log('[Webhook] ✅ Found job:', job.id, '(type:', job.jobType + ')')

    // Idempotency: Check if already processed
    const alreadyProcessed = 
      (job.enhancedImageUrls || []).some(img => 
        (img.predictionId === predictionId && img.url) ||
        (img.upscalePredictionId === predictionId && img.url)
      ) ||
      (job.templateGeneration?.predictionId === predictionId && job.templateGeneration.url) ||
      (job.templateGeneration?.upscalePredictionId === predictionId && job.templateUrl)

    if (alreadyProcessed && status === 'succeeded') {
      console.log('[Webhook] ⏭️ Already processed, skipping:', predictionId)
      return
    }

    //  Route to appropriate handler based on jobType
    let result: HandlerResult
    
    switch (job.jobType) {
      case 'text-to-image':
        result = await handleTextToImage(job, predictionId, status, output, body)
        break
      
      case 'custom-prompt':
        result = await handleCustomPrompt(job, predictionId, status, output, body)
        break
      
      case 'template-merge':
        result = await handleTemplateMerge(job, predictionId, status, output, body)
        break
      
      default:
        console.log('[Webhook] ⚠️ Unknown jobType:', job.jobType)
        return
    }

    //  Update job with result (with retry for write conflicts)
    // Update job with retry logic for WriteConflict
    const updateData: Record<string, unknown> = {}
    
    // Only update status if changed
    if (result.newJobStatus !== null && result.newJobStatus !== undefined) {
      updateData.status = result.newJobStatus
    }
    
    // Only update enhancedImageUrls if returned (handlers may skip returning it for atomic updates)
    if (result.updatedUrls) {
      updateData.enhancedImageUrls = result.updatedUrls
    }

    if (result.templateUpdate) {
      updateData.templateGeneration = {
        ...job.templateGeneration,
        ...result.templateUpdate,
      }
    }

    if (result.templateUrl) {
      updateData.templateUrl = result.templateUrl
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length > 0) {
      // Retry on MongoDB WriteConflict (error code 112)
      let retryCount = 0
      const maxRetries = 3
      while (retryCount < maxRetries) {
        try {
          await payload.update({
            collection: 'jobs',
            id: job.id,
            data: updateData,
          })
          break // Success
        } catch (error: unknown) {
          const isWriteConflict = (error as { code?: number; codeName?: string })?.code === 112 || 
                                  (error as { code?: number; codeName?: string })?.codeName === 'WriteConflict'
          retryCount++
          
          if (!isWriteConflict || retryCount >= maxRetries) {
            throw error // Not a write conflict or out of retries
          }
          
          // Exponential backoff with jitter
          const delay = 100 * Math.pow(2, retryCount - 1) + Math.random() * 50
          console.log(`[Webhook] ⚠️ WriteConflict (attempt ${retryCount}/${maxRetries}), retrying in ${Math.round(delay)}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
      console.log('[Webhook] ✅ Job updated:', job.id)
    } else {
      console.log('[Webhook] ℹ️ No updates needed (image already updated atomically)')
    }

  } catch (error) {
    console.error('[Webhook] ❌ Processing error:', error)
  }
}

export async function POST(req: Request) {
  try {
    // 1. Get raw body for signature verification
    const rawBody = await req.text()
    
    console.log('[Webhook] 📥 Received webhook request')
    console.log('[Webhook] 🔍 Body length:', rawBody.length)
    console.log('[Webhook] 🔍 All headers:', Object.fromEntries(req.headers.entries()))
    
    // 2. Verify webhook signature (security)
    const headers = {
      'webhook-id': req.headers.get('webhook-id') || undefined,
      'webhook-timestamp': req.headers.get('webhook-timestamp') || undefined,
      'webhook-signature': req.headers.get('webhook-signature') || undefined,
    }

    console.log('[Webhook] 🔍 Extracted headers:', headers)

    const verification = await verifyWebhookSignature(rawBody, headers)
    
    if (!verification.isValid) {
      console.error('[Webhook] ❌ Verification failed:', verification.error)
      return NextResponse.json(
        { error: verification.error },
        { status: 403 }
      )
    }

    console.log('[Webhook] ✅ Signature verified')

    // 3. Parse body to get prediction ID
    const body = JSON.parse(rawBody)
    const predictionId = body.id

    if (!predictionId) {
      return NextResponse.json(
        { error: 'Missing prediction ID' },
        { status: 400 }
      )
    }

    // 4. Process webhook and wait for completion
    await processWebhook(rawBody, predictionId)

    return NextResponse.json({ received: true, id: predictionId })

  } catch (error) {
    console.error('[Webhook] ❌ Error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
