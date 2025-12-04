import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { resolvePhotoType } from '@/utilities/photoTypeClassifier'
import type { PhotoType } from '@/utilities/photoTypeClassifier'

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

    // Update job status to processing
    await payload.update({
      collection: 'jobs',
      id: jobId,
      data: {
        status: 'processing',
      },
    })

    // Log start
    await payload.create({
      collection: 'job-logs',
      data: {
        jobId: jobId,
        level: 'info',
        message: 'Started processing job',
        timestamp: new Date().toISOString(),
      },
    })

    try {
      // Get base URL for internal API calls
      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      
      const referenceUrls = job.referenceImageUrls?.map((img) => img.url).filter(Boolean) || []
      
      console.log(`📊 Processing ${referenceUrls.length} images`)
      
      // NEW WORKFLOW: Enhance แต่ละรูปก่อน แล้วค่อยรวมเป็น Collage ทีหลัง
      let finalImageUrl: string | null = null
      
      if (referenceUrls.length > 1) {
        console.log('🎨 Step 1: Enhancing each image individually with hybrid photo type detection...')
        
        const enhancedImageUrls: string[] = []
        let resolvedType: PhotoType | null = null
        
        // Enhance ทีละรูป
        for (let i = 0; i < referenceUrls.length; i++) {
          const imageUrl = referenceUrls[i]
          console.log(`\n🖼️ Processing image ${i + 1}/${referenceUrls.length}...`)
          
          try {
            // 📝 Get template prompt (Gemini will detect photoType inside prompt API)
            console.log(`📝 Getting enhancement prompt for image ${i + 1}/${referenceUrls.length}...`)
            
            let enhancementPrompt = 'ปรับปรุงภาพนี้ให้ดูดีขึ้น หรูหราขึ้นแบบโรงแรมดี แต่สมจริง ยึดองค์ประกอบเดิมทั้งหมด'
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
                    await payload.update({
                      collection: 'jobs',
                      id: jobId,
                      data: { resolvedPhotoType: promptPhotoType },
                    })
                  }
                  
                  console.log(`✅ Detected photoType: ${promptPhotoType}`)
                  console.log('✅ Template prompt:', enhancementPrompt.substring(0, 80) + '...')
                } else {
                  console.warn('⚠️ No prompt in response, using fallback')
                }
              } else {
                console.warn('⚠️ Prompt API failed, using fallback')
              }
            } catch (promptError) {
              console.error('💥 Prompt error:', promptError)
            }
            
            // Log the prompt selection
            await payload.create({
              collection: 'job-logs',
              data: {
                jobId: jobId,
                level: 'info',
                message: `[Image ${i + 1}] PhotoType: ${promptPhotoType} | Template selected`,
                timestamp: new Date().toISOString(),
              },
            })
            
            // ✨ Step: Enhance with Nano-Banana
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
              // ถ้าแต่งไม่สำเร็จ ใช้รูปต้นฉบับแทน
              if (typeof imageUrl === 'string' && imageUrl) {
                enhancedImageUrls.push(imageUrl)
              }
            } else {
              const { imageUrl: enhancedUrl } = await enhanceResponse.json()
              enhancedImageUrls.push(enhancedUrl)
              console.log(`✅ Image ${i + 1} enhanced:`, enhancedUrl)
              
              await payload.create({
                collection: 'job-logs',
                data: {
                  jobId: jobId,
                  level: 'info',
                  message: `Enhanced image ${i + 1}/${referenceUrls.length}`,
                  timestamp: new Date().toISOString(),
                },
              })
            }
          } catch (error) {
            console.error(`💥 Error enhancing image ${i + 1}:`, error)
            // ถ้า error ใช้รูปต้นฉบับแทน
            if (typeof imageUrl === 'string' && imageUrl) {
              enhancedImageUrls.push(imageUrl)
            }
          }
        }
        
        console.log(`\n✅ Enhanced ${enhancedImageUrls.length} images`)
        
        // Store enhancement prompts metadata
        const allPromptsUsed = enhancedImageUrls.map((_, idx) => `Image ${idx + 1}: Dynamic prompt generated`).join('; ')
        
        // Step 2: สร้าง Collage จากรูปที่แต่งแล้ว
        console.log('\n🧩 Step 2: Creating collage from enhanced images...')
        
        const collageTemplate = job.collageTemplate || 'hero_grid'
        const aspectRatio = typeof job.aspectRatio === 'string' ? job.aspectRatio : '16:9'
        const canvasSize = typeof job.canvasSize === 'string' ? job.canvasSize : 'MD'
        
        console.log(`📐 Template: ${collageTemplate}, AspectRatio: ${aspectRatio}, Size: ${canvasSize}`)
        
        try {
          const collageResponse = await fetch(`${baseUrl}/api/collage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrls: enhancedImageUrls,
              template: collageTemplate,
              aspectRatio: aspectRatio,
              size: canvasSize,
            }),
          })

          if (collageResponse.ok) {
            const collageData = await collageResponse.json()
            finalImageUrl = collageData.url
            console.log('✅ Collage created:', finalImageUrl)
            
            await payload.create({
              collection: 'job-logs',
              data: {
                jobId: jobId,
                level: 'info',
                message: `Created collage from ${enhancedImageUrls.length} enhanced images, template: ${collageData.template}`,
                timestamp: new Date().toISOString(),
              },
            })
          } else {
            const errorText = await collageResponse.text()
            console.error('❌ Collage creation failed:', errorText)
            // ถ้าสร้าง collage ไม่สำเร็จ ใช้รูปแรกที่แต่งแล้ว
            finalImageUrl = enhancedImageUrls[0]
          }
        } catch (collageError) {
          console.error('💥 Collage process failed:', collageError)
          // ถ้า error ใช้รูปแรกที่แต่งแล้ว
          finalImageUrl = enhancedImageUrls[0]
        }
      } else {
        // ถ้ามีรูปเดียว ปรับตรงๆ ไม่ต้อง collage
        console.log('📸 Single image - enhancing directly...')
        
        const singleImageUrl = referenceUrls[0]
        
        // 📝 Step: Get enhancement prompt for single image
        // 📝 Get enhancement prompt for single image
        console.log('📝 Getting enhancement prompt for single image...')
        
        let enhancementPrompt = 'ปรับปรุงภาพนี้ให้ดูดีขึ้น หรูหราขึ้นแบบโรงแรมดี แต่สมจริง ยึดองค์ประกอบเดิมทั้งหมด'
        let promptPhotoType: PhotoType = 'generic'
        
        // Get photoType from Sheet if available
        const photoTypeFromSheet = typeof job.photoTypeFromSheet === 'string' 
          ? job.photoTypeFromSheet 
          : undefined
        
        try {
          // Call prompt API (Gemini Vision + template selection)
          const promptRes = await fetch(`${baseUrl}/api/generate/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productName: typeof job.productName === 'string' ? job.productName : 'Hotel / Resort',
              contentTopic: typeof job.contentTopic === 'string' ? job.contentTopic : undefined,
              contentDescription: typeof job.contentDescription === 'string' ? job.contentDescription : undefined,
              referenceImageUrls: [singleImageUrl],
              photoTypeFromSheet,
            }),
          })

          if (promptRes.ok) {
            const data = await promptRes.json()
            if (data.prompt && typeof data.prompt === 'string') {
              enhancementPrompt = data.prompt
              promptPhotoType = (data.photoType as PhotoType) || 'generic'
              
              await payload.update({
                collection: 'jobs',
                id: jobId,
                data: { resolvedPhotoType: promptPhotoType },
              })
              
              console.log(`✅ Detected photoType: ${promptPhotoType}`)
              console.log('✅ Template prompt:', enhancementPrompt.substring(0, 80) + '...')
            } else {
              console.warn('⚠️ No prompt in response, using fallback')
            }
          } else {
            console.warn('⚠️ Prompt API failed, using fallback')
          }
        } catch (promptError) {
          console.error('💥 Prompt error:', promptError)
        }
        
        // Log the prompt selection
        await payload.create({
          collection: 'job-logs',
          data: {
            jobId: jobId,
            level: 'info',
            message: `[Single Image] PhotoType: ${promptPhotoType} | Template selected`,
            timestamp: new Date().toISOString(),
          },
        })
        
        const enhanceResponse = await fetch(`${baseUrl}/api/generate/enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: singleImageUrl,
            prompt: enhancementPrompt,
            photoType: promptPhotoType,
            jobId: jobId,
          }),
        })
        
        if (!enhanceResponse.ok) {
          const errorText = await enhanceResponse.text()
          throw new Error(`Single image enhancement failed: ${errorText}`)
        }
        
        const { imageUrl: enhancedUrl } = await enhanceResponse.json()
        finalImageUrl = enhancedUrl
        console.log('✅ Single image enhanced:', finalImageUrl)
      }
      
      // Step 4: Update job status to completed
      console.log('✅ Job processing complete! Final image:', finalImageUrl)
      
      // Prepare generated images object for different platforms
      const generatedImages: Record<string, { url: string; width: number; height: number }> = {}
      
      if (finalImageUrl) {
        // For now, use the final image for all platforms
        // TODO: Add resize functionality later
        generatedImages['facebook'] = { url: finalImageUrl, width: 1200, height: 630 }
        generatedImages['instagram_feed'] = { url: finalImageUrl, width: 1080, height: 1080 }
        generatedImages['instagram_story'] = { url: finalImageUrl, width: 1080, height: 1920 }
      }
      
      // Update job with final image URL and generated images
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          generatedPrompt: `Template prompts generated for ${referenceUrls.length} image(s) using Gemini Vision + Nano-Banana`,
          promptGeneratedAt: new Date().toISOString(),
          status: 'completed',
          generatedImages: generatedImages,
        },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: `Job completed successfully. Processed ${referenceUrls.length} image(s)`,
          timestamp: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        success: true,
        jobId,
        finalImageUrl,
      })

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Image generation failed'
      // Log error
      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'error',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      })

      // Update job status to failed
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          status: 'failed',
          errorMessage: errorMessage,
          retryCount: (job.retryCount || 0) + 1,
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
