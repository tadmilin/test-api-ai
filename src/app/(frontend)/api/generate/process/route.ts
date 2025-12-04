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
            // ✨ Step 1a: Analyze photo type with GPT Vision + Validation
            console.log('🔍 Analyzing photo type and validating against sheet data...')
            
            let detectedPhotoType: PhotoType = 'generic'
            let isRelevant = true
            let validationWarning: string | null = null
            
            try {
              const analyzeRes = await fetch(`${baseUrl}/api/analyze/photoType`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  imageUrl,
                  sheetType: (job as any).photoTypeFromSheet,
                }),
              })

              if (analyzeRes.ok) {
                const { sheetType, detectedType, confidence } = await analyzeRes.json()
                detectedPhotoType = resolvePhotoType(sheetType, detectedType)
                
                // 🔍 Validation: Check if detected type matches sheet type
                if (sheetType && detectedType && sheetType !== 'generic' && detectedType !== 'other') {
                  if (sheetType !== detectedType) {
                    isRelevant = false
                    validationWarning = `⚠️ Mismatch: Sheet says "${sheetType}" but image looks like "${detectedType}" (confidence: ${confidence || 'N/A'})`
                    console.warn(validationWarning)
                    
                    // Log warning to job logs
                    await payload.create({
                      collection: 'job-logs',
                      data: {
                        jobId: jobId,
                        level: 'warning',
                        message: `Image ${i + 1}: ${validationWarning}`,
                        timestamp: new Date().toISOString(),
                      },
                    })
                  } else {
                    console.log(`✅ Validation passed: Image matches "${detectedType}"`)
                  }
                }
                
                console.log(`📋 Sheet type: ${sheetType || 'none'}, GPT detected: ${detectedType || 'none'} → Resolved: ${detectedPhotoType}`)
                
                // เซฟ resolvedPhotoType ครั้งแรก
                if (i === 0 && !resolvedType) {
                  resolvedType = detectedPhotoType
                  await payload.update({
                    collection: 'jobs',
                    id: jobId,
                    data: { 
                      resolvedPhotoType: detectedPhotoType,
                      ...(validationWarning && { errorMessage: validationWarning })
                    } as any,
                  })
                }
              } else {
                console.warn('⚠️ Photo type analysis failed, using fallback')
                detectedPhotoType = ((job as any).photoTypeFromSheet as PhotoType) || 'generic'
              }
            } catch (analyzeError) {
              console.error('💥 Photo type analysis error:', analyzeError)
              detectedPhotoType = ((job as any).photoTypeFromSheet as PhotoType) || 'generic'
            }
            
            // 📝 Step: Dynamic prompt per image
            console.log(`📝 Generating dynamic enhancement prompt for image ${i + 1}/${referenceUrls.length}...`)
            
            let enhancementPrompt = 'Professional hotel photo retouch: improve lighting, colors, and clarity naturally.'
            
            try {
              const promptRes = await fetch(`${baseUrl}/api/generate/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  productName: (job as any).productName || 'Hotel / Resort',
                  contentTopic: (job as any).contentTopic || (job as any).contentDescription,
                  contentDescription: (job as any).contentDescription,
                  referenceImageUrls: [imageUrl],
                  analysisOnly: false,
                }),
              })

              if (promptRes.ok) {
                const data = await promptRes.json()
                if (data.prompt) {
                  enhancementPrompt = data.prompt
                  console.log('✅ Dynamic prompt:', enhancementPrompt.substring(0, 120) + '...')
                } else {
                  console.warn('⚠️ Prompt API response has no prompt field, using default fallback')
                }
              } else {
                console.warn('⚠️ Prompt API request failed, using default fallback')
              }
            } catch (promptError) {
              console.error('💥 Prompt generation error:', promptError)
            }
            
            // ✨ Step: Enhance with dynamic prompt
            const enhanceResponse = await fetch(`${baseUrl}/api/generate/enhance`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageUrl,
                prompt: enhancementPrompt,
                strength: job.enhancementStrength || 0.55,
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
        console.log(`📐 Using template: ${collageTemplate}`)
        
        try {
          const collageResponse = await fetch(`${baseUrl}/api/collage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrls: enhancedImageUrls,
              template: collageTemplate,
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
        console.log('📸 Single image - enhancing with hybrid photo type detection...')
        
        const singleImageUrl = referenceUrls[0]
        
        // ✨ Analyze photo type with GPT Vision
        console.log('🔍 Analyzing photo type...')
        
        let detectedPhotoType: PhotoType = 'generic'
        
        try {
          const analyzeRes = await fetch(`${baseUrl}/api/analyze/photoType`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrl: singleImageUrl,
              sheetType: (job as any).photoTypeFromSheet,
            }),
          })

          if (analyzeRes.ok) {
            const { sheetType, detectedType } = await analyzeRes.json()
            detectedPhotoType = resolvePhotoType(sheetType, detectedType)
            console.log(`📋 Sheet type: ${sheetType || 'none'}, GPT detected: ${detectedType || 'none'} → Resolved: ${detectedPhotoType}`)
            
            await payload.update({
              collection: 'jobs',
              id: jobId,
              data: { resolvedPhotoType: detectedPhotoType },
            })
          } else {
            console.warn('⚠️ Photo type analysis failed, using fallback')
            detectedPhotoType = ((job).photoTypeFromSheet as PhotoType) || 'generic'
          }
        } catch (analyzeError) {
          console.error('💥 Photo type analysis error:', analyzeError)
          detectedPhotoType = ((job).photoTypeFromSheet as PhotoType) || 'generic'
        }
        
        // 📝 Step: Dynamic prompt for single image
        console.log('📝 Generating dynamic enhancement prompt for single image...')
        
        let enhancementPrompt = 'Professional hotel photo retouch: improve lighting, colors, and clarity naturally.'
        
        try {
          const promptRes = await fetch(`${baseUrl}/api/generate/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productName: (job as any).productName || 'Hotel / Resort',
              contentTopic: (job as any).contentTopic || (job as any).contentDescription,
              contentDescription: (job as any).contentDescription,
              referenceImageUrls: [singleImageUrl],
              analysisOnly: false,
            }),
          })

          if (promptRes.ok) {
            const data = await promptRes.json()
            if (data.prompt) {
              enhancementPrompt = data.prompt
              console.log('✅ Dynamic prompt:', enhancementPrompt.substring(0, 120) + '...')
            } else {
              console.warn('⚠️ Prompt API response has no prompt field, using default fallback')
            }
          } else {
            console.warn('⚠️ Prompt API request failed, using default fallback')
          }
        } catch (promptError) {
          console.error('💥 Prompt generation error:', promptError)
        }
        
        const enhanceResponse = await fetch(`${baseUrl}/api/generate/enhance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: singleImageUrl,
            prompt: enhancementPrompt,
            strength: job.enhancementStrength || 0.55,
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
          generatedPrompt: `Dynamic prompts generated for ${referenceUrls.length} image(s) using GPT-4 Vision analysis`,
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
