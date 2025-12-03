import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

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
      
      // NEW WORKFLOW: สร้าง Collage ก่อน แล้วค่อย Enhance ทีเดียว
      let finalImageUrl: string | null = null
      
      if (referenceUrls.length > 1) {
        console.log('🖼️ Step 1: Creating collage from original images...')
        
        // Default template ถ้าไม่ได้เลือก
        const collageTemplate = job.collageTemplate || 'hero_grid'
        console.log(`📐 Using template: ${collageTemplate}`)
        
        try {
          const collageResponse = await fetch(`${baseUrl}/api/collage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrls: referenceUrls,
              template: collageTemplate,
            }),
          })

          if (collageResponse.ok) {
            const collageData = await collageResponse.json()
            const collageUrl = collageData.url
            console.log('✅ Collage created:', collageUrl)
            
            await payload.create({
              collection: 'job-logs',
              data: {
                jobId: jobId,
                level: 'info',
                message: `Created collage with ${referenceUrls.length} original images, template: ${collageData.template}`,
                timestamp: new Date().toISOString(),
              },
            })
            
            // Step 2: Enhance the collage with SDXL
            console.log('🎨 Step 2: Enhancing collage with SDXL...')
            
            const contentDescription = job.contentDescription || job.contentTopic || job.productName || ''
            const simplePrompt = contentDescription 
              ? `Professional hotel photo enhancement: improve lighting and colors for ${contentDescription}. Keep composition unchanged.`
              : 'Professional hotel photo: enhance lighting, improve colors, sharpen details. Preserve layout.'
            
            console.log('Using prompt:', simplePrompt)
            
            const enhanceResponse = await fetch(`${baseUrl}/api/generate/enhance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                collageUrl: collageUrl,
                prompt: simplePrompt,
                strength: job.enhancementStrength || 0.3,
                jobId: jobId,
              }),
            })
            
            if (!enhanceResponse.ok) {
              const errorText = await enhanceResponse.text()
              console.error('Enhancement failed:', errorText)
              throw new Error(`Collage enhancement failed: ${errorText}`)
            }
            
            const { imageUrl: enhancedCollageUrl } = await enhanceResponse.json()
            finalImageUrl = enhancedCollageUrl
            console.log('✅ Enhanced collage:', finalImageUrl)
            
            await payload.create({
              collection: 'job-logs',
              data: {
                jobId: jobId,
                level: 'info',
                message: 'Enhanced collage successfully',
                timestamp: new Date().toISOString(),
              },
            })
            
            // Optional: ESRGAN Final Polish (only for final output)
            console.log('✨ Step 3: ESRGAN final polish...')
            try {
              const replicate = new (await import('replicate')).default({ 
                auth: process.env.REPLICATE_API_TOKEN 
              })
              
              const polishPrediction = await replicate.predictions.create({
                version: 'f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
                input: {
                  image: finalImageUrl,
                  scale: 1,
                  face_enhance: false,
                },
              })
                
                // Wait for completion
                const polishResult = await replicate.wait(polishPrediction)
                const polishedOutput = Array.isArray(polishResult.output)
                  ? polishResult.output[0]
                  : polishResult.output as string
                
                console.log('✅ Final polish complete:', polishedOutput)
                finalImageUrl = polishedOutput
                
                await payload.create({
                  collection: 'job-logs',
                  data: {
                    jobId: jobId,
                    level: 'info',
                    message: 'Applied ESRGAN final polish to collage',
                    timestamp: new Date().toISOString(),
                  },
                })
              } catch (polishError) {
                console.error('⚠️ Final polish failed, using unpolished collage:', polishError)
                finalImageUrl = collageUrl
              }
            } else {
              finalImageUrl = collageUrl
            }
          } else {
            const errorText = await collageResponse.text()
            console.error('❌ Final collage creation failed:', errorText)
            throw new Error(`Final collage failed: ${errorText}`)
          }
        } catch (collageError) {
          console.error('💥 Final collage failed:', collageError)
          throw collageError
        }
      } else {
        // ถ้ามีรูปเดียว ปรับตรงๆ ไม่ต้อง collage
        console.log('📸 Single image - enhancing directly without collage...')
        
        const singleImageUrl = referenceUrls[0]
        const contentDescription = job.contentDescription || job.contentTopic || job.productName || ''
        const simplePrompt = contentDescription 
          ? `Professional hotel photo enhancement: improve lighting and colors for ${contentDescription}. Keep composition unchanged.`
          : 'Professional hotel photo: enhance lighting, improve colors, sharpen details.'
        
        const enhanceResponse = await fetch(`${baseUrl}/api/generate/enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collageUrl: singleImageUrl,
            prompt: simplePrompt,
            strength: job.enhancementStrength || 0.3,
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
          generatedPrompt: 'Enhanced affordable hotel/resort photos with natural, realistic improvements',
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
