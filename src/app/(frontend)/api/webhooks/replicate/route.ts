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
    const jobs = await payload.find({
      collection: 'jobs',
      where: {
        or: [
          { 'enhancedImageUrls.predictionId': { equals: predictionId } },
          { 'enhancedImageUrls.upscalePredictionId': { equals: predictionId } },
          { 'templateGeneration.predictionId': { equals: predictionId } },
          { 'templateGeneration.upscalePredictionId': { equals: predictionId } },
        ],
      },
    })

    if (jobs.docs.length === 0) {
      console.log('[Webhook] ⚠️ No job found for prediction:', predictionId)
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
    
    // 2. Verify webhook signature (security)
    const headers = {
      'webhook-id': req.headers.get('webhook-id') || undefined,
      'webhook-timestamp': req.headers.get('webhook-timestamp') || undefined,
      'webhook-signature': req.headers.get('webhook-signature') || undefined,
    }

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

    // 4. Respond immediately (Replicate expects fast response)
    // Process webhook in background without awaiting
    processWebhook(rawBody, predictionId).catch(error => {
      console.error('[Webhook] ❌ Background processing failed:', error)
    })

    return NextResponse.json({ received: true, id: predictionId })

  } catch (error) {
    console.error('[Webhook] ❌ Error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
