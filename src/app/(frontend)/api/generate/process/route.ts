import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
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

    // Get template settings
    const templateMode = (typeof job.templateMode === 'string' ? job.templateMode : 'satori') as 'satori' | 'ai'
    const templateType = (typeof job.templateType === 'string' ? job.templateType : 'triple') as string
    const templateStyle = (typeof job.templateStyle === 'string' ? job.templateStyle : 'minimal') as string

    console.log(`🎯 Template Mode: ${templateMode}`)
    console.log(`📐 Template Type: ${templateType}`)
    if (templateMode === 'ai') {
      console.log(`🎨 Template Style: ${templateStyle}`)
    }

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
        message: `Started processing job (Mode: ${templateMode})`,
        timestamp: new Date().toISOString(),
      },
    })

    try {
      // Get base URL for internal API calls
      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
      
      const referenceUrls = job.referenceImageUrls?.map((img: { url?: string | null }) => img.url).filter(Boolean) || []
      
      console.log(`📊 Processing ${referenceUrls.length} images`)
      
      // PHASE 1: Enhance all images
      console.log('🎨 Phase 1: Enhancing images with Nano-Banana Pro...')
      
      const enhancedImageUrls: { url: string; status: 'pending' | 'approved' | 'regenerating'; originalUrl: string }[] = []
      let resolvedType: PhotoType | null = null
      
      // Enhance ทีละรูป
      for (let i = 0; i < referenceUrls.length; i++) {
          const imageUrl = referenceUrls[i]
          console.log(`\n🖼️ Processing image ${i + 1}/${referenceUrls.length}...`)
          
          try {
            // 📝 Get template prompt (Gemini will detect photoType inside prompt API)
            console.log(`📝 Getting enhancement prompt for image ${i + 1}/${referenceUrls.length}...`)
            
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
              // ถ้า error ใช้รูปต้นฉบับแทน
              if (typeof imageUrl === 'string' && imageUrl) {
                enhancedImageUrls.push({
                  url: imageUrl,
                  status: 'pending' as const,
                  originalUrl: typeof imageUrl === 'string' ? imageUrl : '',
                })
              }
            } else {
              const { imageUrl: enhancedUrl } = await enhanceResponse.json()
              enhancedImageUrls.push({
                url: enhancedUrl,
                status: 'pending' as const,
                originalUrl: typeof imageUrl === 'string' ? imageUrl : '',
              })
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
              enhancedImageUrls.push({
                url: imageUrl,
                status: 'pending' as const,
                originalUrl: imageUrl,
              })
            }
          }
        }
        
        console.log(`\n✅ Enhanced ${enhancedImageUrls.length} images`)

        // Save enhanced images and update status to completed (will be updated by finalize later)
        await payload.update({
          collection: 'jobs',
          id: jobId,
          data: {
            enhancedImageUrls: enhancedImageUrls,
            status: 'completed', // Use 'completed' temporarily, frontend will show review UI
          },
        })

        await payload.create({
          collection: 'job-logs',
          data: {
            jobId: jobId,
            level: 'info',
            message: `Phase 1 complete: ${enhancedImageUrls.length} images enhanced. Waiting for review.`,
            timestamp: new Date().toISOString(),
          },
        })

        console.log('⏸️ PAUSED: Waiting for user to review and approve images')
        console.log(`📍 Next step: User should visit /review-images/${jobId}`)

        return NextResponse.json({
          success: true,
          message: 'Images enhanced. Please review and approve.',
          jobId: jobId,
          status: 'review_pending',
          enhancedImages: enhancedImageUrls,
          nextUrl: `/review-images/${jobId}`,
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
