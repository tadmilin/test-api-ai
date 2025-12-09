import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { PhotoType } from '@/utilities/photoTypeClassifier'
import { ensurePublicImage } from '@/utilities/imageProcessing'

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      )
    }

    const payload = await getPayload({ config })

    // Get the job
    const job = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    })

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Get template settings (AI mode only)
    const templateType = (typeof job.templateType === 'string' ? job.templateType : 'triple') as string

    console.log(`🎯 Template Mode: AI (Nano-Banana Pro)`)
    console.log(`📐 Template Type: ${templateType}`)

    // Update job status to enhancing
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        status: 'processing', // Use 'processing' instead of 'enhancing'
      },
    })

    // Log start
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId: jobId,
        level: 'info',
        message: 'Started processing job (Mode: AI - Nano-Banana Pro)',
        timestamp: new Date().toISOString(),
      },
    })

    try {
      // Get base URL for internal API calls
      // Use request.nextUrl.origin to get the correct base URL (especially in Vercel)
      const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      
      const referenceUrls = job.referenceImageUrls?.map((img: { url?: string | null }) => img.url).filter(Boolean) || []
      
      console.log(`📊 Processing ${referenceUrls.length} images`)
      
      // Helper: Timeout wrapper to prevent hanging
      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
          )
        ])
      }
      
      // PHASE 1: Enhance all images IN PARALLEL
      console.log('🎨 Phase 1: Enhancing images with Nano-Banana Pro (parallel)...')
      
      let resolvedType: PhotoType | null = null
      
      // Process all images in parallel using Promise.all
      // Add staggered delay to prevent overwhelming Replicate
      const STAGGER_DELAY_MS = 2000 // 2 seconds between each image (increased from 0.5s to reduce failures)
      
      const enhancePromises = referenceUrls.map(async (rawImageUrl, i) => {
        // Stagger the requests: image 0 starts immediately, image 1 after 2s, image 2 after 4s, etc.
        const delayMs = i * STAGGER_DELAY_MS
        if (delayMs > 0) {
          console.log(`⏱️ Image ${i + 1}: Waiting ${delayMs/1000}s before starting...`)
          await new Promise(resolve => setTimeout(resolve, delayMs))
        }
        
        console.log(`\n🖼️ Starting image ${i + 1}/${referenceUrls.length}...`)
        
        // Safe cast since we filtered Boolean above
        const safeRawUrl = rawImageUrl as string
        
        try {
          // 0. Ensure Public Image (Parallel inside the loop)
          // This allows fast images to proceed immediately without waiting for slow ones
          const imageUrl = await ensurePublicImage(safeRawUrl, jobId, baseUrl)
          
          // 📝 Get template prompt (Gemini will detect photoType inside prompt API)
          console.log(`📝 Getting enhancement prompt for image ${i + 1}...`)
          
          let enhancementPrompt = 'ปรับปรุงภาพนี้ให้ดูดีขึ้น หรูหราขึ้นแบบโรงแรม"รีสอร์ทสมัยใหม่"Modern Tropical 3-4ดาว แต่สมจริงไม่เวอร์เกินไป ทำให้ดูดีขึ้นหรูหราขึ้นจากภาพเดิมเห็นความแตกต่างโดยยึดองค์ประกอบเดิมจากภาพเดิมทั้งหมด'
          let promptPhotoType: PhotoType = 'generic'
          
          // Get photoType from Sheet if available
          const photoTypeFromSheet = typeof job.photoTypeFromSheet === 'string' 
            ? job.photoTypeFromSheet 
            : undefined
          
          try {
            // Call prompt API (Gemini Vision will detect photoType and return template)
            const promptRes = await fetch(`${baseUrl}/api/generate/prompt`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                productName: typeof job.productName === 'string' ? job.productName : 'Hotel / Resort',
                contentTopic: typeof job.contentTopic === 'string' ? job.contentTopic : undefined,
                contentDescription: typeof job.contentDescription === 'string' ? job.contentDescription : undefined,
                referenceImageUrls: [imageUrl],
                photoTypeFromSheet,
              }),
            })

            if (promptRes.ok) {
              const data = await promptRes.json()
              if (data.prompt && typeof data.prompt === 'string') {
                enhancementPrompt = data.prompt
                promptPhotoType = (data.photoType as PhotoType) || 'generic'
                
                // Store photoType from first image
                if (i === 0 && !resolvedType) {
                  resolvedType = promptPhotoType
                }
                
                console.log(`✅ Image ${i + 1} detected photoType: ${promptPhotoType}`)
              }
            }
          } catch (promptError) {
            console.error(`💥 Prompt error for image ${i + 1}:`, promptError)
          }
          
          // Log the prompt selection
          await payload.create({
            collection: 'job-logs',
            data: {
              jobId: jobId,
              level: 'info',
              message: `[Image ${i + 1}] PhotoType: ${promptPhotoType} | Starting enhancement`,
              timestamp: new Date().toISOString(),
            },
          })
          
          // ✨ Step: Start enhancement (returns predictionId immediately)
          const enhanceResponse = await fetch(`${baseUrl}/api/generate/enhance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl,
              prompt: enhancementPrompt,
              photoType: promptPhotoType,
              jobId: jobId,
            }),
          })
          
          if (!enhanceResponse.ok) {
            const errorText = await enhanceResponse.text()
            console.error(`⚠️ Enhancement failed for image ${i + 1}:`, errorText)
            return {
              url: typeof imageUrl === 'string' ? imageUrl : '',
              status: 'pending' as const,
              originalUrl: typeof referenceUrls[i] === 'string' ? referenceUrls[i] : imageUrl, // Keep original Drive URL for reference if needed
              predictionId: null,
            }
          }
          
          const { predictionId } = await enhanceResponse.json()
          console.log(`✅ Image ${i + 1} enhancement started: ${predictionId}`)
          
          return {
            url: '', // Will be filled after polling
            status: 'pending' as const,
            originalUrl: typeof referenceUrls[i] === 'string' ? referenceUrls[i] : imageUrl,
            predictionId,
            imageIndex: i,
          }
          
        } catch (error) {
          console.error(`💥 Error starting enhancement for image ${i + 1}:`, error)
          return {
            url: typeof safeRawUrl === 'string' ? safeRawUrl : '',
            status: 'pending' as const,
            originalUrl: typeof referenceUrls[i] === 'string' ? referenceUrls[i] : safeRawUrl,
            predictionId: null,
          }
        }
      })
      
      // Wait for all predictions to start (with timeout protection)
      // Timeout: 30s per image + 10s buffer
      const TIMEOUT_MS = (referenceUrls.length * 30000) + 10000
      console.log(`⏱️ Setting timeout: ${TIMEOUT_MS/1000}s for ${referenceUrls.length} images`)
      
      const predictionResults = await withTimeout(
        Promise.all(enhancePromises),
        TIMEOUT_MS,
        `Timeout waiting for ${referenceUrls.length} image enhancements to start`
      )
      
      console.log(`\n✅ All ${predictionResults.length} enhancements started in parallel`)
      
      // Store prediction IDs in the job for client-side polling
      const enhancedImageUrls = predictionResults.map(result => ({
        url: '', // Will be filled after client polls
        status: 'pending' as const, // Valid status for schema (will be updated when complete)
        originalUrl: result.originalUrl,
        predictionId: result.predictionId,
      }))

      // Save prediction IDs immediately - client will poll
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          enhancedImageUrls: enhancedImageUrls,
          status: 'enhancing', // Processing predictions
        },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: `Started ${predictionResults.length} image enhancements in parallel. Client should poll status.`,
          timestamp: new Date().toISOString(),
        },
      })

      console.log('🚀 All predictions started - returning immediately')
      console.log(`📍 Client should poll: GET /api/generate/process/status?jobId=${jobId}`)

      return NextResponse.json({
        success: true,
        message: 'Image enhancements started. Poll for status.',
        jobId: jobId,
        status: 'enhancing',
        predictions: predictionResults.map(r => ({
          predictionId: r.predictionId,
          originalUrl: r.originalUrl,
        })),
        pollUrl: `/api/generate/process/status?jobId=${jobId}`,
      })

      } catch (error: unknown) {
        console.error('💥 Processing error:', error)
        
        // Update job status to failed
        await payload.update({
          collection: 'jobs',
          id: jobId,
          data: {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Processing failed',
          },
        })

        await payload.create({
          collection: 'job-logs',
          data: {
            jobId: jobId,
            level: 'error',
            message: error instanceof Error ? error.message : 'Processing failed',
            timestamp: new Date().toISOString(),
          },
        })

        throw error
      }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to process job'
    console.error('Error processing job:', error)
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
