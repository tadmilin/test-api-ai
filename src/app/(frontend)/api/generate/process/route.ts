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
    }) as any  // Type cast to avoid TypeScript errors for new fields

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
      
      const referenceUrls = job.referenceImageUrls?.map((img: any) => img.url).filter(Boolean) || []
      
      console.log(`📊 Processing ${referenceUrls.length} images`)
      
      // NEW WORKFLOW: Enhance แต่ละรูปก่อน แล้วค่อยสร้าง Graphic Design
      let finalImageUrl: string | null = null
      
      console.log('🎨 Creating professional graphic design with auto layout...')
      
      const enhancedImageUrls: string[] = []
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
        
        // Step 2: สร้าง Professional Design ด้วย Satori
        console.log('\n🎨 Step 2: Creating professional design with Satori...')
        
        // เช็คว่าใช้ Overlay Design หรือ Graphic Design
        const useOverlayDesign = job.useOverlayDesign === true && enhancedImageUrls.length > 1
        const overlayAspectRatio = typeof job.overlayAspectRatio === 'string' ? job.overlayAspectRatio : '3:1'
        const heroImageIndex = typeof job.heroImageIndex === 'number' ? job.heroImageIndex : 0
        const overlayTheme = typeof job.overlayTheme === 'string' ? job.overlayTheme : 'modern'
        const graphicTheme = typeof job.graphicTheme === 'string' ? job.graphicTheme : 'modern'
        const socialMediaFormat = typeof job.socialMediaFormat === 'string' ? job.socialMediaFormat : 'facebook_post'
        
        if (useOverlayDesign) {
          console.log(`📐 Mode: OVERLAY DESIGN (Satori)`)
          console.log(`📐 Aspect Ratio: ${overlayAspectRatio}`)
          console.log(`⭐ Hero Image Index: ${heroImageIndex}`)
        } else {
          console.log(`📐 Mode: GRAPHIC DESIGN (Satori)`)
          console.log(`📐 Format: ${socialMediaFormat}`)
        }
        console.log(`🖼️ Images: ${enhancedImageUrls.length}`)
        
        try {
          if (useOverlayDesign) {
            // ใช้ Satori สำหรับ Overlay Design
            const params = new URLSearchParams()
            enhancedImageUrls.forEach(url => params.append('image', url))
            params.append('aspectRatio', overlayAspectRatio)
            params.append('heroIndex', heroImageIndex.toString())
            params.append('style', overlayTheme)  // ใช้ธีมที่เลือก
            
            const overlayUrl = `${baseUrl}/api/generate-overlay?${params.toString()}`
            
            console.log('🎨 Generating overlay design with Satori...')
            const overlayResponse = await fetch(overlayUrl)
            
            if (overlayResponse.ok) {
              // Satori returns image directly, we need to upload it
              const imageBuffer = await overlayResponse.arrayBuffer()
              const imageBlob = new Blob([imageBuffer], { type: 'image/png' })
              
              // Upload to Media collection
              const formData = new FormData()
              formData.append('file', imageBlob, `overlay-${jobId}.png`)
              
              const uploadResponse = await fetch(`${baseUrl}/api/media`, {
                method: 'POST',
                body: formData,
              })
              
              if (uploadResponse.ok) {
                const uploadData = await uploadResponse.json()
                finalImageUrl = uploadData.doc.url
                console.log('✅ Overlay design created:', finalImageUrl)
                
                await payload.create({
                  collection: 'job-logs',
                  data: {
                    jobId: jobId,
                    level: 'info',
                    message: `Created overlay design from ${enhancedImageUrls.length} enhanced images`,
                    timestamp: new Date().toISOString(),
                  },
                })
              } else {
                console.error('❌ Failed to upload overlay image')
                finalImageUrl = enhancedImageUrls[0]
              }
            } else {
              console.error('❌ Overlay generation failed')
              finalImageUrl = enhancedImageUrls[0]
            }
          } else {
            // ใช้ Satori สำหรับ Graphic Design (รูปเดียว หรือ ไม่เปิด Overlay)
            const params = new URLSearchParams()
            enhancedImageUrls.forEach(url => params.append('image', url))
            params.append('format', socialMediaFormat)
            params.append('style', graphicTheme)  // ใช้ธีมที่เลือก
            
            const graphicUrl = `${baseUrl}/api/generate-graphic?${params.toString()}`
            
            console.log('🎨 Generating graphic design with Satori...')
            const graphicResponse = await fetch(graphicUrl)

            if (graphicResponse.ok) {
              // Upload image to Blob storage
              const imageBuffer = await graphicResponse.arrayBuffer()
              const timestamp = Date.now()
              
              const { put } = await import('@vercel/blob')
              const blob = await put(`graphics/graphic-${timestamp}.png`, imageBuffer, {
                access: 'public',
                contentType: 'image/png',
              })
              
              finalImageUrl = blob.url
              console.log('✅ Graphic design created:', finalImageUrl)
              
              await payload.create({
                collection: 'job-logs',
                data: {
                  jobId: jobId,
                  level: 'info',
                  message: `Created professional graphic design from ${enhancedImageUrls.length} enhanced image(s)`,
                  timestamp: new Date().toISOString(),
                },
              })
            } else {
              const errorText = await graphicResponse.text()
              console.error('❌ Graphic design creation failed:', errorText)
              finalImageUrl = enhancedImageUrls[0]
            }
          }
        } catch (designError) {
          console.error('💥 Design process failed:', designError)
          finalImageUrl = enhancedImageUrls[0]
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
