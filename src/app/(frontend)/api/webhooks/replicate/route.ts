import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { handleTextToImage, handleCustomPrompt, handleTemplateMerge } from './handlers'
import { verifyWebhookSignature } from './verifyWebhook'

//  Force Node.js runtime
export const runtime = 'nodejs'

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
    })

    // If not found, search in enhancing/processing jobs manually
    if (jobs.docs.length === 0) {
      console.log('[Webhook] 🔍 Standard query failed, trying manual search...')
      
      const enhancingJobs = await payload.find({
        collection: 'jobs',
        where: {
          status: {
            in: ['enhancing', 'processing', 'generating_template'],
          },
        },
        limit: 100,  // ✅ Increased limit
      })

      console.log('[Webhook] 🔍 Found', enhancingJobs.docs.length, 'jobs with status enhancing/processing/generating_template')
      
      const found = enhancingJobs.docs.find((job: any) => {
        // Check enhancedImageUrls
        if (job.enhancedImageUrls) {
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
        jobs = { docs: [found] } as any
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
      console.log('[Webhook] 🔍 All enhancing jobs:', allEnhancing.docs.map((j: any) => ({
        id: j.id,
        images: j.enhancedImageUrls?.map((img: any) => ({
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
      (job.enhancedImageUrls || []).some((img: any) => 
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
    let result: any
    
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

    //  Update job with result
    const updateData: any = {
      enhancedImageUrls: result.updatedUrls,
      status: result.newJobStatus,
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

    await payload.update({
      collection: 'jobs',
      id: job.id,
      data: updateData,
    })

    console.log('[Webhook] ✅ Job updated:', job.id)

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
