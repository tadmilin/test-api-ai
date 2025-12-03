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
      
      console.log(`📊 Processing ${referenceUrls.length} images, useCollage: ${job.useCollage}`)
      
      // NEW WORKFLOW: ปรับแต่ละรูปก่อน แล้วค่อย Collage
      const enhancedImageUrls: string[] = []
      
      if (referenceUrls.length > 0) {
        console.log('🎨 Step 1: Analyzing images and generating prompts...')
        
        // ใช้ GPT-4 Vision วิเคราะห์แต่ละรูปว่าเกี่ยวข้องกับ content หรือไม่
        const contentDescription = job.contentDescription || job.contentTopic || ''
        console.log('Content from sheet:', contentDescription)
        
        // Loop ปรับแต่ละรูป
        for (let i = 0; i < referenceUrls.length; i++) {
          const imageUrl = referenceUrls[i]
          console.log(`  📷 Enhancing image ${i + 1}/${referenceUrls.length}...`)
          
          try {
            // Generate content-aware prompt สำหรับแต่ละรูป
            let enhancePrompt = 'Enhance this affordable hotel/resort photo with natural, realistic lighting. Improve brightness, color balance, clarity, and fine details while keeping the entire structure and layout unchanged. Make it look more inviting and professional without adding fake elements or changing the scene.'
            
            if (contentDescription) {
              console.log(`  🔍 Analyzing if image matches content...`)
              const analysisResponse = await fetch(`${baseUrl}/api/generate/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  productName: job.productName,
                  productDescription: job.productDescription,
                  contentTopic: job.contentTopic,
                  postTitleHeadline: job.postTitleHeadline,
                  contentDescription: contentDescription,
                  mood: job.mood,
                  referenceImageUrls: [imageUrl],
                }),
              })
              
              if (analysisResponse.ok) {
                const { prompt } = await analysisResponse.json()
                if (prompt && prompt.trim()) {
                  enhancePrompt = prompt
                  console.log(`  ✅ Using content-aware prompt`)
                } else {
                  console.log(`  ⚠️ Empty prompt from API, using default`)
                }
              } else {
                console.log(`  ⚠️ Prompt API failed, using default`)
              }
            }
            
            const enhanceResponse = await fetch(`${baseUrl}/api/generate/enhance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                collageUrl: imageUrl,
                prompt: enhancePrompt, // ใช้ prompt ที่ปรับตาม content
                strength: job.enhancementStrength || 0.15,
                jobId: jobId, // เพิ่ม jobId
              }),
            })

            if (!enhanceResponse.ok) {
              const errorText = await enhanceResponse.text()
              console.error(`    ❌ Enhancement failed for image ${i + 1}:`, errorText)
              throw new Error(`Image ${i + 1} enhancement failed: ${errorText}`)
            }

            const { url: enhancedUrl } = await enhanceResponse.json()
            enhancedImageUrls.push(enhancedUrl)
            console.log(`    ✅ Image ${i + 1} enhanced:`, enhancedUrl)
            
            await payload.create({
              collection: 'job-logs',
              data: {
                jobId: jobId,
                level: 'info',
                message: `Enhanced image ${i + 1}/${referenceUrls.length}`,
                timestamp: new Date().toISOString(),
              },
            })
          } catch (enhanceError) {
            console.error(`💥 Image ${i + 1} enhancement failed:`, enhanceError)
            throw enhanceError
          }
        }
        
        console.log(`✅ All ${enhancedImageUrls.length} images enhanced successfully`)
      }
      
      // Step 2: สร้าง Collage จากรูปที่ปรับแล้ว (ถ้ามีมากกว่า 1 รูป และเปิด useCollage)
      let finalImageUrl: string | null = null
      
      if (enhancedImageUrls.length > 1 && job.useCollage) {
        console.log('🖼️ Step 2: Creating collage from enhanced images...')
        try {
          const collageResponse = await fetch(`${baseUrl}/api/collage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrls: enhancedImageUrls,
              template: job.collageTemplate || null,
            }),
          })

          if (collageResponse.ok) {
            const collageData = await collageResponse.json()
            finalImageUrl = collageData.url
            console.log('✅ Final collage created:', finalImageUrl)
            
            await payload.create({
              collection: 'job-logs',
              data: {
                jobId: jobId,
                level: 'info',
                message: `Created final collage with ${enhancedImageUrls.length} enhanced images, template: ${collageData.template}`,
                timestamp: new Date().toISOString(),
              },
            })
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
        // ถ้าไม่ collage หรือมีรูปเดียว ใช้รูปแรกที่ปรับแล้ว
        finalImageUrl = enhancedImageUrls[0] || null
        console.log('⏭️ Using first enhanced image:', finalImageUrl)
      }
      
      // Step 3: Update job status to completed
      console.log('✅ Job processing complete! Final image:', finalImageUrl)
      
      // Update job with final image URL
      await payload.update({
        collection: 'jobs',
        id: jobId,
        data: {
          generatedPrompt: 'Enhanced affordable hotel/resort photos with natural, realistic improvements',
          promptGeneratedAt: new Date().toISOString(),
          status: 'completed',
        },
      })

      await payload.create({
        collection: 'job-logs',
        data: {
          jobId: jobId,
          level: 'info',
          message: `Job completed successfully. Enhanced ${enhancedImageUrls.length} images${job.useCollage ? ' and created collage' : ''}`,
          timestamp: new Date().toISOString(),
        },
      })

      return NextResponse.json({
        success: true,
        jobId,
        finalImageUrl,
        enhancedImageUrls,
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
