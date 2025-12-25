import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import type { Job } from '@/payload-types'

// ✅ Force Node.js runtime
export const runtime = 'nodejs'

/**
 * SIMPLIFIED Process API - enhance images with Nano-Banana Pro
 * Clean, fast, no complex logic
 */
export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
    }

    const payload = await getPayload({ config })

    // Get the job
    const job = await payload.findByID({
      collection: 'jobs',
      id: jobId,
    }) as Job

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // ⚠️ GUARD: Prevent duplicate processing
    if (job.status === 'processing' || job.status === 'enhancing') {
      console.log(`⚠️ Job ${jobId} is already being processed (status: ${job.status})`)
      return NextResponse.json({ 
        error: 'Job is already being processed',
        status: job.status,
        message: 'Please wait for current processing to complete'
      }, { status: 409 })
    }

    console.log(`🚀 Starting job ${jobId}`)

    // Update job status
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: { status: 'processing' },
    })

    // Log start
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId: jobId,
        level: 'info',
        message: 'Started enhancing images with Nano-Banana Pro',
        timestamp: new Date().toISOString(),
      },
    })

    try {
      const baseUrl = request.nextUrl.origin || process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      const referenceUrls = job.referenceImageUrls?.map((img: { url?: string | null }) => img.url).filter(Boolean) || []
      
      console.log(`📊 Processing ${referenceUrls.length} images`)
      
      if (referenceUrls.length === 0) {
        throw new Error('No reference images found')
      }

      console.log(`🎯 Starting loop for ${referenceUrls.length} images...`)

      // Get sheetRows data for per-image metadata
      const sheetRows = (job as { sheetRows?: Array<{ productName?: string; photoType?: string; contentTopic?: string; postTitleHeadline?: string; contentDescription?: string }> }).sheetRows || []
      console.log(`📋 Sheet rows data:`, sheetRows.length > 0 ? `${sheetRows.length} rows` : 'none (fallback to job photoType)')

      // ✅ STEP 1: Create placeholders in DB first (visible immediately)
      console.log(`📝 Creating placeholders for ${referenceUrls.length} images...`)
      const placeholders = referenceUrls.map((url: string | null | undefined, index: number) => {
        const sheetRow = sheetRows[index] || {}
        return {
          originalUrl: (url || '') as string,
          url: null, // No Blob URL yet
          tempOutputUrl: null, // No Replicate URL yet
          predictionId: null, // Will be filled after create prediction
          status: 'pending' as const,
          photoType: sheetRow.photoType || job.photoTypeFromSheet || 'generic',
          contentTopic: sheetRow.contentTopic || job.contentTopic || '',
          postTitleHeadline: sheetRow.postTitleHeadline || job.postTitleHeadline || '',
          contentDescription: sheetRow.contentDescription || job.contentDescription || '',
        }
      })
      
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'enhancing',
          enhancedImageUrls: placeholders,
        },
      })
      console.log(`✅ Placeholders created, job status: enhancing`)

      // ✅ STEP 2: Keep local copy in memory (avoid DB reads in loop)
      type EnhancedImage = NonNullable<Job['enhancedImageUrls']>[number]
      const localEnhanced: EnhancedImage[] = [...placeholders]

      // ✅ STEP 3: Process images sequentially with stagger delay
      const STAGGER_DELAY_MS = 2000
      const predictionIds: string[] = []
      const imageMetadata: Array<{
        photoType: string
        contentTopic?: string
        postTitleHeadline?: string
        contentDescription?: string
      }> = []

      for (let i = 0; i < referenceUrls.length; i++) {
        const imageUrl = referenceUrls[i] as string
        
        // Get per-image metadata from sheetRows or fallback to job-level data
        const sheetRow = sheetRows[i] || {}
        const photoTypeFromSheet = sheetRow.photoType || job.photoTypeFromSheet || null
        
        console.log(`\n🖼️ Processing image ${i + 1}/${referenceUrls.length}`)
        console.log(`📋 Sheet row:`, sheetRow.productName || 'N/A')
        console.log(`📷 PhotoType:`, photoTypeFromSheet || 'generic')
        console.log(`🔗 Original URL:`, imageUrl.substring(0, 80) + '...')
        
        // Stagger requests
        if (i > 0) {
          console.log(`⏱️ Image ${i + 1}: Waiting ${STAGGER_DELAY_MS/1000}s...`)
          await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY_MS))
        }

        try {
          // ⚠️ CRITICAL: Upload Google Drive URL to Blob Storage first
          // Replicate can't access Google Drive URLs due to auth requirements
          let processedImageUrl = imageUrl
          
          if (imageUrl.includes('drive.google.com') || imageUrl.includes('googleusercontent.com')) {
            console.log(`📤 Downloading from Google Drive and uploading to Blob Storage...`)
            
            try {
              const { downloadDriveFile, extractDriveFileId } = await import('@/utilities/downloadDriveFile')
              const fileId = extractDriveFileId(imageUrl)
              
              if (!fileId) {
                throw new Error('Could not extract Drive file ID from URL')
              }
              
              console.log(`📥 Downloading Drive file: ${fileId}`)
              const fileBuffer = await downloadDriveFile(fileId)
              const originalMB = fileBuffer.length / 1024 / 1024
              console.log(`📊 Original: ${originalMB.toFixed(2)} MB`)
              
              // ✅ CRITICAL: Resize + Compress to prevent E9243
              const sharp = (await import('sharp')).default
              const metadata = await sharp(fileBuffer).metadata()
              const width = metadata.width || 0
              const height = metadata.height || 0
              console.log(`📐 Original dimensions: ${width}x${height}`)
              
              // Helper: Round to 64
              const roundTo64 = (val: number) => Math.max(64, Math.floor(val / 64) * 64)
              
              const MAX_DIMENSION = 1024
              const TARGET_ASPECT_RATIO = 1.5 // 3:2 ratio for nano-banana-pro
              
              let pipeline = sharp(fileBuffer)
              let newWidth = width
              let newHeight = height
              
              // Calculate target dimensions maintaining 3:2 ratio
              if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                // Scale down maintaining aspect ratio first
                const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
                newWidth = width * scale
                newHeight = height * scale
              }
              
              // Force 3:2 ratio (1.5:1) for Replicate compatibility
              const currentRatio = newWidth / newHeight
              if (Math.abs(currentRatio - TARGET_ASPECT_RATIO) > 0.01) {
                // Adjust to exact 3:2 ratio
                if (currentRatio > TARGET_ASPECT_RATIO) {
                  // Too wide - reduce width
                  newWidth = newHeight * TARGET_ASPECT_RATIO
                } else {
                  // Too tall - reduce height
                  newHeight = newWidth / TARGET_ASPECT_RATIO
                }
                console.log(`📐 Adjusted to 3:2 ratio: ${currentRatio.toFixed(3)} → ${TARGET_ASPECT_RATIO}`)
              }
              
              // Round to 64 (required by Flux models)
              newWidth = roundTo64(newWidth)
              newHeight = roundTo64(newHeight)
              
              console.log(`🔽 Resizing to ${newWidth}x${newHeight} (ratio: ${(newWidth/newHeight).toFixed(2)})`)
              pipeline = pipeline.resize(newWidth, newHeight, { 
                fit: 'inside',  // Don't distort - maintain aspect ratio
                withoutEnlargement: true 
              })
              
              // Compress with dynamic quality
              let quality = 80
              let processedBuffer = await pipeline
                .jpeg({ quality, chromaSubsampling: '4:4:4' })
                .toBuffer()
              
              // If still > 8MB, reduce quality
              const processedMB = processedBuffer.length / 1024 / 1024
              if (processedMB > 8) {
                console.log(`⚠️ Still ${processedMB.toFixed(2)} MB > 8MB, reducing quality to 70`)
                quality = 70
                processedBuffer = await sharp(fileBuffer)
                  .resize(newWidth, newHeight, { 
                    fit: 'inside',
                    withoutEnlargement: true 
                  })
                  .jpeg({ quality, chromaSubsampling: '4:4:4' })
                  .toBuffer()
              }
              
              const finalMB = processedBuffer.length / 1024 / 1024
              console.log(`✅ Optimized: ${originalMB.toFixed(2)} MB → ${finalMB.toFixed(2)} MB (${newWidth}x${newHeight}, Q${quality})`)
              
              const filename = `jobs/${jobId}/source-${i + 1}.jpg`
              const { put } = await import('@vercel/blob')
              const { url: blobUrl } = await put(filename, processedBuffer, {
                access: 'public',
                contentType: 'image/jpeg',
                addRandomSuffix: true,
              })
              
              console.log(`✅ Uploaded to Blob: ${blobUrl}`)
              processedImageUrl = blobUrl
              
            } catch (uploadError) {
              console.error(`❌ Drive download/upload failed:`, uploadError)
              throw new Error(`Cannot upload image to stable storage: ${uploadError instanceof Error ? uploadError.message : 'Unknown'}`)
            }
          } else if (imageUrl.includes('replicate.delivery')) {
            console.log(`⚠️ Using Replicate URL (may expire in 24-48h)`)
          } else if (imageUrl.includes('blob.vercel-storage.com')) {
            console.log(`✅ Already Blob URL`)
          } else {
            console.log(`🌐 Using external URL:`, imageUrl.substring(0, 50))
          }
          

          // Get prompt for this specific image
          console.log(`📝 Getting prompt for ${photoTypeFromSheet || 'generic'}...`)
          
          let prompt: string
          let photoType: string
          
          // Check if custom prompt exists
          if (job.customPrompt && job.customPrompt.trim()) {
            prompt = job.customPrompt.trim()
            photoType = photoTypeFromSheet || 'custom'
            console.log(`✅ Using custom prompt (${prompt.length} chars)`)
            console.log(`📄 Custom prompt: ${prompt.substring(0, 100)}...`)
          } else {
            // Use auto-generated prompt (original behavior)
            const promptRes = await fetch(`${baseUrl}/api/generate/prompt`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ photoTypeFromSheet }),
            })

            if (!promptRes.ok) {
              throw new Error(`Prompt API failed: ${promptRes.status}`)
            }

            const promptData = await promptRes.json()
            prompt = promptData.prompt
            photoType = promptData.photoType
            console.log(`✅ Using auto-generated prompt for: ${photoType}`)
          }
          
          // Store metadata for this image
          imageMetadata.push({
            photoType,
            contentTopic: sheetRow.contentTopic || '',
            postTitleHeadline: sheetRow.postTitleHeadline || '',
            contentDescription: sheetRow.contentDescription || '',
          })

          // Start enhancement with processed URL
          const enhanceRes = await fetch(`${baseUrl}/api/generate/enhance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: processedImageUrl, // Use Blob URL instead of Google Drive
              prompt,
              photoType,
              jobId,
              outputSize: job.outputSize || '1:1-2K', // ✅ ส่ง outputSize ไป enhance API
            }),
          })

          if (!enhanceRes.ok) {
            const errorData = await enhanceRes.json().catch(() => ({ error: 'Unknown error' }))
            const errorMsg = errorData.error || `HTTP ${enhanceRes.status}`
            
            // Propagate error message with status code
            throw new Error(`[${enhanceRes.status}] ${errorMsg}`)
          }

          const { predictionId } = await enhanceRes.json()
          predictionIds.push(predictionId)
          
          console.log(`✅ Image ${i + 1} started: ${predictionId}`)
          
          // ✅ STEP 4: Update local array + DB (no findByID needed)
          try {
            localEnhanced[i] = {
              ...localEnhanced[i],
              predictionId: predictionId,
            }
            
            await payload.update({
              collection: 'jobs',
              id: jobId,
              data: { enhancedImageUrls: localEnhanced as typeof job.enhancedImageUrls },
            })
            console.log(`   ✅ Updated placeholder ${i} with predictionId`)
          } catch (updateErr) {
            console.warn(`   ⚠️ Failed to update placeholder:`, updateErr)
            // Don't fail - webhook will handle
          }

        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          console.error(`❌ Image ${i + 1} failed:`, message)
          
          // ✅ Mark placeholder as failed (use local array)
          try {
            localEnhanced[i] = {
              ...localEnhanced[i],
              status: 'failed',
              error: message,
            }
            
            await payload.update({
              collection: 'jobs',
              id: jobId,
              data: { 
                enhancedImageUrls: localEnhanced as typeof job.enhancedImageUrls,
                status: 'failed'  // Mark job as failed
              },
            })
          } catch (updateErr) {
            console.warn(`   ⚠️ Failed to update failed status:`, updateErr)
          }
          
          // Log to job-logs for debugging
          await payload.create({
            collection: 'job-logs',
            data: {
              jobId,
              level: 'error',
              message: `Image ${i + 1}/${referenceUrls.length} failed: ${message}`,
              timestamp: new Date().toISOString(),
            },
          })
          
          // Throw error to stop processing and mark job as failed
          throw error
        }
      }

      console.log(`✅ Loop completed! Processed ${referenceUrls.length} images`)
      console.log(`📊 Summary: ${predictionIds.filter(id => id).length}/${referenceUrls.length} images started successfully`)
      console.log(`📋 Prediction IDs:`, predictionIds)
      
      // ✅ No need to update enhancedImageUrls again - already updated per-image above
      console.log(`✅ All ${referenceUrls.length} images queued`)

      // ✅ Auto cleanup handled by Jobs afterChange hook (100 jobs limit)

      return NextResponse.json({
        status: 'enhancing',
        predictions: predictionIds,
        total: referenceUrls.length,
      })

    } catch (error: unknown) {
      console.error('❌ Processing error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: { status: 'failed' },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId,
          level: 'error',
          message: `Processing failed: ${errorMessage}`,
          timestamp: new Date().toISOString(),
        },
      })

      throw error
    }

  } catch (error: unknown) {
    console.error('❌ Process API error:', error)
    const message = error instanceof Error ? error.message : 'Failed to process job'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
