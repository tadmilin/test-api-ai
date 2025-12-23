'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FolderTree, type TreeFolder } from '@/components/FolderTree'
import { getGoogleDriveThumbnail, normalizeImageUrl, isGoogleDriveUrl } from '@/utilities/googleDriveUrl'

interface CurrentUser {
  id: string
  name: string
  email: string
  role: string
}

interface JobStats {
  pending: number
  processing: number
  completed: number
  failed: number
  approved: number
  rejected: number
  total: number
}

interface Job {
  id: string
  productName: string
  status: string
  createdAt: string
  updatedAt?: string
  contentTopic?: string
  postTitleHeadline?: string
  contentDescription?: string
  outputSize?: string
  createdBy?: {
    id: string
    name: string
    email: string
  }
  generatedPrompt?: string
  templateUrl?: string
  generatedImages?: {
    facebook?: { url: string; width: number; height: number }
    instagram_feed?: { url: string; width: number; height: number }
    instagram_story?: { url: string; width: number; height: number }
  }
  enhancedImageUrls?: Array<{
    url?: string
    status?: string
    predictionId?: string
    upscalePredictionId?: string
    originalUrl?: string
    photoType?: string
    contentTopic?: string
    postTitleHeadline?: string
    contentDescription?: string
    error?: string
  }>
}

interface UserActivity {
  userId: string
  userName: string
  email: string
  jobsCreated: number
  jobsApproved: number
  jobsRejected: number
  lastActivity: string
}

interface SheetData {
  [key: string]: string
}

interface DriveImage {
  id: string
  name: string
  thumbnailUrl: string
  url: string
  photoType?: string // Per-image photo type selection
}

interface ImageSet {
  sheetRow: SheetData
  images: DriveImage[] // Each image has its own photoType
}

const IMAGE_SIZES = {
  facebook: { label: 'โพสต์ Facebook', width: 1200, height: 630 },
  instagram_feed: { label: 'ฟีด Instagram', width: 1080, height: 1080 },
  instagram_story: { label: 'สตอรี่ Instagram', width: 1080, height: 1920 },
}

export default function DashboardPage() {
  const router = useRouter()
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  
  // Stats & Jobs
  const [stats, setStats] = useState<JobStats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  })
  const [recentJobs, setRecentJobs] = useState<Job[]>([])
  const [_userActivities, setUserActivities] = useState<UserActivity[]>([])

  // Create Job Form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [spreadsheets, setSpreadsheets] = useState<{ id: string; name: string }[]>([])
  const [selectedSheetId, setSelectedSheetId] = useState<string>('')
  const [sheetData, setSheetData] = useState<SheetData[]>([])
  const [currentSheetRow, setCurrentSheetRow] = useState<SheetData | null>(null)
  const [driveFolders, setDriveFolders] = useState<Array<{ driveId: string; driveName: string; folders: TreeFolder[] }>>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')
  const [driveFolderId, setDriveFolderId] = useState<string>('')
  const [driveImages, setDriveImages] = useState<DriveImage[]>([])
  const [currentImages, setCurrentImages] = useState<DriveImage[]>([])
  const [imagePhotoTypes, setImagePhotoTypes] = useState<Record<string, string>>({}) // Track photo type per image ID
  const [imageSets, setImageSets] = useState<ImageSet[]>([])
  const [creating, setCreating] = useState(false)
  
  // Review & Finalize States
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [enhancedImages, setEnhancedImages] = useState<Array<{
    url?: string
    status?: string
    originalUrl?: string
    predictionId?: string
    upscalePredictionId?: string
    photoType?: string
    contentTopic?: string
    postTitleHeadline?: string
    contentDescription?: string
    error?: string
  }>>([])
  const [generatedTemplateUrl, setGeneratedTemplateUrl] = useState<string | null>(null)
  const [expandedImageIds, setExpandedImageIds] = useState<Set<number | string>>(new Set())
  const [reviewMode, setReviewMode] = useState(false)
  const [_regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [_finalImageUrl, setFinalImageUrl] = useState<string | null>(null)
  const [imageLoadErrors, setImageLoadErrors] = useState<Record<string, number>>({})

  // View Generated Images
  const [viewingJob, setViewingJob] = useState<Job | null>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<keyof typeof IMAGE_SIZES>('facebook')

  // Processing status
  const [processingJobId, setProcessingJobId] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [completedCount, setCompletedCount] = useState<number>(0)
  const [showSuccess, setShowSuccess] = useState<boolean>(false)
  const [processingError, setProcessingError] = useState<string>('')
  
  // ✅ Storage Status
  const [storageStatus, setStorageStatus] = useState<{
    totalJobs: number
    limit: number
    usage: string
    usagePercent: number
    estimatedStorageMB: number
    storagePercent: number
    status: 'healthy' | 'warning' | 'critical'
    timestamp: string
  } | null>(null)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  
  // ✅ Polling guard: prevent multiple concurrent polling loops
  const isPollingRef = useRef(false)

  const [_loading, setLoading] = useState(true)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me')
      if (!res.ok) {
        router.push('/login')
        return
      }
      const userData = await res.json()
      setCurrentUser(userData.user)
    } catch (err) {
      console.error('Auth error:', err)
      router.push('/login')
    } finally {
      setAuthLoading(false)
    }
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // ✅ CRITICAL FIX: Define pollJobStatus FIRST using useCallback to prevent circular dependency
  const pollJobStatus = useCallback(async (jobId: string) => {
    // ✅ Guard: prevent multiple polling loops running concurrently
    if (isPollingRef.current) {
      console.log('⚠️ Polling already active, skipping duplicate call')
      return
    }
    
    isPollingRef.current = true
    console.log(`🔄 Starting polling for job ${jobId}`)
    
    const maxPolls = 60  // ✅ ลดเหลือ 2 นาที (60 * 2s = 120s)
    let polls = 0
    
    try {
    while (polls < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // ลดเหลือ 2 วินาที
      polls++
      
      try {
        const statusRes = await fetch(`/api/generate/process/status?jobId=${jobId}`)
        if (!statusRes.ok) {
          console.error(`❌ Fetch failed: ${statusRes.status}`)
          continue
        }
        
        const statusData = await statusRes.json()
        console.log(`✅ Fetch success:`, statusData)
        
        // Merge with existing metadata
        if (statusData.images && statusData.images.length > 0) {
          setEnhancedImages(prevImages => {
            if (prevImages.length === 0) return statusData.images
            return statusData.images.map((newImg: {
              url?: string
              status?: string
              predictionId?: string
              originalUrl?: string
              photoType?: string
              contentTopic?: string
              postTitleHeadline?: string
              contentDescription?: string
              upscalePredictionId?: string
            }, index: number) => {
              const prevImg = prevImages[index] || {}
              const merged = {
                ...prevImg,
                url: newImg.url || prevImg.url,
                status: newImg.status || prevImg.status,
                predictionId: newImg.predictionId || prevImg.predictionId,
                originalUrl: newImg.originalUrl || prevImg.originalUrl,
                photoType: newImg.photoType || prevImg.photoType,
                contentTopic: newImg.contentTopic || prevImg.contentTopic,
                postTitleHeadline: newImg.postTitleHeadline || prevImg.postTitleHeadline,
                contentDescription: newImg.contentDescription || prevImg.contentDescription,
                upscalePredictionId: newImg.upscalePredictionId || prevImg.upscalePredictionId,
              }
              // Debug log to check photoType preservation
              if (merged.photoType !== prevImg.photoType) {
                console.log(`⚠️ PhotoType changed for image ${index + 1}:`, prevImg.photoType, '→', merged.photoType)
              }
              return merged
            })
          })
        }
        
        const progress = `${statusData.completed}/${statusData.total}`
        const processingCount = statusData.processing || 0
        
        // ✅ เช็ค template generation และ upscale
        let isTemplateGenerating = false
        let isTemplateUpscaling = false
        let templatePredictionId: string | null = null
        let jobData: Job & { templateGeneration?: { predictionId?: string; upscalePredictionId?: string; status?: string; url?: string }; templatePredictionId?: string; templateUpscalePredictionId?: string; templateUrl?: string } | null = null
        let templateGen: { predictionId?: string; upscalePredictionId?: string; status?: string; url?: string } = {}
        
        try {
          const jobRes = await fetch(`/api/jobs/${jobId}`)
          if (jobRes.ok) {
            jobData = await jobRes.json()
            if (jobData) {
              // ✅ อ่านจาก templateGeneration object (ใหม่) หรือ legacy fields
              templateGen = jobData.templateGeneration || {}
              templatePredictionId = templateGen.predictionId || jobData.templatePredictionId || null
              isTemplateGenerating = !!templatePredictionId && templateGen.status !== 'succeeded'
              isTemplateUpscaling = !!templateGen.upscalePredictionId || !!jobData.templateUpscalePredictionId
              
              // Update template URL if available
              const templateUrl = templateGen.url || jobData.templateUrl
              if (templateUrl && templateUrl !== generatedTemplateUrl) {
                setGeneratedTemplateUrl(templateUrl)
                console.log('✅ Template URL updated:', templateUrl)
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to fetch job for template check:', error)
        }

        // ✅ ถ้ากำลังเจน template → poll create-template API
        if (isTemplateGenerating && templatePredictionId) {
          console.log(`🎨 Template generation in progress`)
          setProcessingStatus(`🎨 กำลังสร้าง Template (รอ 30-60 วิ)...`)
          
          try {
            const templateRes = await fetch(`/api/generate/create-template?predictionId=${templatePredictionId}&jobId=${jobId}`)
            if (templateRes.ok) {
              const templateData = await templateRes.json()
              console.log(`📊 Template status: ${templateData.status}`)
              
              if (templateData.status === 'succeeded' && templateData.imageUrl) {
                console.log('✅ Template completed!')
                setGeneratedTemplateUrl(templateData.imageUrl)
                setProcessingStatus('✅ Template พร้อมแล้ว!')
                break // ✅ หยุด polling เมื่อเสร็จ
              } else if (templateData.status === 'failed') {
                console.error('❌ Template failed')
                setProcessingStatus('❌ Template generation failed')
                break
              }
            }
          } catch (error) {
            console.warn('⚠️ Failed to poll template:', error)
          }
          
          continue // Skip normal status check
        }
        
        // ✅ ถ้ากำลัง upscale template (เฉพาะ 1:1) → แสดงสถานะและ continue
        if (isTemplateUpscaling) {
          console.log(`🔍 Template upscale in progress`)
          setProcessingStatus(`🎨 กำลัง Upscale Template เป็น 2048x2048...`)
          
          // ✅ เช็คอีกครั้งว่า upscale เสร็จหรือยัง
          if (templateGen.url && templateGen.status === 'succeeded') {
            console.log('✅ Template upscale completed!')
            setGeneratedTemplateUrl(templateGen.url)
            setProcessingStatus('✅ Template พร้อมแล้ว!')
            break
          }
          
          continue
        }
        
        // ✅ แสดงสถานะตามประเภทของงาน
        if (processingCount > 0) {
          // มีงานที่กำลังประมวลผลอยู่ (อาจเป็น upscale)
          const upscalingCount = statusData.images?.filter((img: { upscalePredictionId?: string; status?: string }) => img.upscalePredictionId && img.status === 'pending').length || 0
          
          if (upscalingCount > 0) {
            setProcessingStatus(`🔄 กำลัง Upscale รูปเป็น 2048x2048... (${statusData.completed}/${statusData.total})`)
          } else {
            setProcessingStatus(`⏳ ประมวลผลแล้ว ${progress} รูป`)
          }
        } else {
          setProcessingStatus(`⏳ ประมวลผลแล้ว ${progress} รูป`)
        }
        
        // ✅ DEBUG: Log status before all checks
        console.log(`📊 Poll status:`, {
          allComplete: statusData.allComplete,
          jobStatus: statusData.jobStatus,
          completed: statusData.completed,
          total: statusData.total,
        })
        
        // ✅ Skip early job status check - let allComplete handle template generation first
        // (moved to after allComplete check)
        
        // Check for failed images
        const anyFailed = statusData.images?.some((img: { status?: string }) => img.status === 'failed')
        if (anyFailed) {
          const failedImg = statusData.images?.find((img: { status?: string; error?: string }) => img.status === 'failed')
          const errorMsg = failedImg?.error || 'Unknown error'
          console.log(`❌ Image failed: ${errorMsg}`)
          setProcessingStatus(`❌ ประมวลผลล้มเหลว: ${errorMsg} - กดรีเฟรชหรือเจนใหม่`)
          
          // DON'T auto-clear - let user refresh or retry
          // setProcessingJobId(null) - keep banner visible
          fetchDashboardData()  // Refresh to show failed status in job list
          break
        }
        
        console.log(`🎯 Checking allComplete: ${statusData.allComplete}`)
        
        // ✅ Convert to boolean (in case API returns string)
        const allComplete = statusData.allComplete === true || statusData.allComplete === 'true'
        
        // ✅ ถ้ากำลังเจน template/upscale อยู่ → ยัง poll ต่อ
        if (isTemplateGenerating || isTemplateUpscaling) {
          console.log('🎨 Template processing in progress, continuing to poll...')
          continue // Skip allComplete check
        }
        
        if (allComplete) {
          console.log(`✅ All images complete for job ${jobId}`)
          
          // ✅ Check if template generation is pending (from custom-prompt)
          let pendingTemplateUrl = localStorage.getItem('pendingTemplateUrl')
          let pendingTemplateJobId = localStorage.getItem('pendingTemplateJobId')
          
          console.log('🔍 Template check:', {
            hasPendingUrl: !!pendingTemplateUrl,
            pendingTemplateJobId,
            currentJobId: jobId,
            match: pendingTemplateJobId === jobId,
          })
          
          // ⚠️ ถ้า job นี้ไม่ตรงกับ pendingTemplateJobId → clear localStorage ทันที
          if (pendingTemplateJobId && pendingTemplateJobId !== jobId) {
            console.log('⚠️ Clearing stale localStorage (different job)')
            localStorage.removeItem('pendingTemplateUrl')
            localStorage.removeItem('pendingTemplateJobId')
            // Re-fetch after clearing
            pendingTemplateUrl = null
            pendingTemplateJobId = null
          }
          
          if (pendingTemplateUrl && pendingTemplateJobId === jobId) {
            // ✅ FIRST: Clear localStorage to prevent race condition
            localStorage.removeItem('pendingTemplateUrl')
            localStorage.removeItem('pendingTemplateJobId')
            
            console.log('🎨 Starting template generation...')
            setProcessingStatus('🎨 กำลังสร้าง Template...')
            
            try {
              // ✅ Fetch job status to get enhanced image URLs (different API than process/status)
              console.log('📡 Fetching job status for image URLs...')
              const jobStatusRes = await fetch(`/api/jobs/${jobId}/status`)
              
              if (!jobStatusRes.ok) {
                throw new Error(`Failed to fetch job status: ${jobStatusRes.status}`)
              }
              
              const jobStatusData = await jobStatusRes.json()
              console.log('📋 Job status response:', jobStatusData)
              
              // Get enhanced image URLs from job status API
              const enhancedImageUrls = (jobStatusData.images || [])
                .filter((img: { status?: string; url?: string }) => {
                  console.log(`   Image filter: status=${img.status}, hasUrl=${!!img.url}`)
                  return img.status === 'completed' && img.url
                })
                .map((img: { url: string }) => img.url)
              
              console.log(`   ✅ Found ${enhancedImageUrls.length} completed images`)
              
              if (enhancedImageUrls.length === 0) {
                throw new Error('No completed images found with URLs')
              }

              // Start template generation (async)
              console.log('🚀 Starting async template generation...')
              const templateRes = await fetch('/api/generate/create-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  enhancedImageUrls,
                  templateUrl: pendingTemplateUrl,
                  jobId: jobId,  // ✅ ส่ง jobId เพื่อบันทึก upscale prediction
                }),
              })

              if (!templateRes.ok) {
                const errorData = await templateRes.json().catch(() => ({ error: 'Unknown error' }))
                throw new Error(errorData.error || 'Failed to start template generation')
              }

              const { predictionId } = await templateRes.json()
              console.log(`✅ Template prediction started: ${predictionId}`)

              // localStorage already cleared at the top (before starting)

              // Poll for completion
              setProcessingStatus('🎨 กำลังสร้าง Template (รอ 30-60 วิ)...')
              
              for (let pollCount = 0; pollCount < 60; pollCount++) {
                await new Promise(resolve => setTimeout(resolve, 2000)) // 2s interval
                
                const pollRes = await fetch(`/api/generate/create-template?predictionId=${predictionId}&jobId=${jobId}`) // ✅ ส่ง jobId ด้วย
                const pollData = await pollRes.json()
                
                console.log(`📊 Template poll ${pollCount + 1}: ${pollData.status}`)
                
                if (pollData.status === 'succeeded') {
                  // Save template URL to job
                  await fetch(`/api/jobs/${jobId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      templateUrl: pollData.imageUrl,
                    }),
                  })

                  console.log('✅ Template generated successfully')
                  setProcessingStatus('✅ Template สำเร็จ!')
                  
                  // Set template URL
                  setGeneratedTemplateUrl(pollData.imageUrl)
                  console.log('✅ Template URL set:', pollData.imageUrl)
                  
                  // Wait 3s to show success message before clearing
                  await new Promise(resolve => setTimeout(resolve, 3000))
                  
                  // Clear banner and refresh dashboard
                  setProcessingStatus('')
                  setProcessingJobId(null)
                  fetchDashboardData()
                  
                  // localStorage already cleared after prediction started
                  
                  return  // Exit function completely (don't fall through to cleanup code)
                } else if (pollData.status === 'failed' || pollData.status === 'canceled') {
                  // localStorage already cleared
                  
                  throw new Error(pollData.error || 'Template generation failed')
                }
                
                // Update status with progress
                setProcessingStatus(`🎨 กำลังสร้าง Template (${pollCount * 2}s)...`)
              }
              
            } catch (error) {
              console.error('❌ Template error:', error)
              setProcessingStatus(`❌ Template error: ${error} - กดรีเฟรชหรือเจนใหม่`)
              
              // DON'T auto-clear - let user refresh or retry
              // Keep banner visible with error message
              
              // localStorage already cleared at prediction start (or never started)
              // Only clear if prediction never started (error before POST)
              localStorage.removeItem('pendingTemplateUrl')
              localStorage.removeItem('pendingTemplateJobId')
              
              // Refresh to show failed status in job list
              fetchDashboardData()
              break
            }
            
            // ✅ Success cases already returned above
            // If we reach here, it's an error case that broke from catch block
            // Error banner should remain visible (already set in catch)
            break
          } else {
            // ✅ Stop polling after allComplete (if no template was needed)
            console.log('✅ Text-to-Image completed - showing images')
            setProcessingStatus('✅ ประมวลผลสำเร็จ!')
            
            // Set images to display
            if (statusData.images && statusData.images.length > 0) {
              setEnhancedImages(statusData.images)
              setCurrentJobId(jobId)
              setReviewMode(true)  // ✅ แสดงรูป
            }
            
            // Wait 3s to show success message before clearing banner
            await new Promise(resolve => setTimeout(resolve, 3000))
            
            setProcessingStatus('')
            setProcessingJobId(null)
            
            // ✅ Refresh dashboard to update job list (but reviewMode stays true)
            fetchDashboardData()
            
            return  // Exit function completely
          }
        }
      } catch (error) {
        console.error('Poll error:', error)
      }
    }
    
    // Timeout warning
    if (polls >= maxPolls) {
      setProcessingStatus('⚠️ Timeout - กรุณารีเฟรชหน้าเพื่อดูสถานะล่าสุด')
      
      // DON'T auto-clear - let user refresh manually
      // Keep banner visible so user knows there's an issue
      fetchDashboardData()  // Refresh to show current status in job list
    }
    
    } finally {
      // ✅ Always clear polling flag when done
      isPollingRef.current = false
      console.log(`✅ Polling completed for job ${jobId}`)
    }
  }, [generatedTemplateUrl, fetchDashboardData]) // ✅ Dependencies for useCallback

  // Resume processing for any jobs stuck in processing/enhancing state
  const resumeProcessingJobs = useCallback(async () => {
    try {
      // Check BOTH 'processing' AND 'enhancing' status AND active template jobs
      const [processingRes, enhancingRes, completedRes] = await Promise.all([
        fetch('/api/jobs?status=processing'),
        fetch('/api/jobs?status=enhancing'),
        fetch('/api/jobs?status=completed&limit=5') // ✅ เช็ค completed jobs ล่าสุดด้วย (สำหรับ template generation)
      ])
      
      const processingData = await processingRes.json()
      const enhancingData = await enhancingRes.json()
      const completedData = await completedRes.json()
      
      const allJobs = [
        ...(processingData.jobs || []),
        ...(enhancingData.jobs || []),
        ...(completedData.jobs || []).filter((job: Job) => {
          // ✅ เฉพาะ completed jobs ที่กำลังเจน template อยู่
          const templateGen = (job as Job & { templateGeneration?: { predictionId?: string; upscalePredictionId?: string }; templatePredictionId?: string; templateUpscalePredictionId?: string }).templateGeneration || {}
          return !!templateGen.predictionId || !!templateGen.upscalePredictionId || !!(job as typeof job & { templatePredictionId?: string }).templatePredictionId || !!(job as typeof job & { templateUpscalePredictionId?: string }).templateUpscalePredictionId
        })
      ]
      
      console.log(`📋 Found ${allJobs.length} jobs (processing + enhancing + template generation)`)
      
      // Find jobs with predictions that might still be running
      for (const job of allJobs) {
        console.log(`🔍 Checking job ${job.id}`)
        
        // Check if job has enhancedImageUrls (started processing)
        if (job.enhancedImageUrls && job.enhancedImageUrls.length > 0) {
          const hasIncomplete = job.enhancedImageUrls.some(
            (img: { url?: string; status?: string; upscalePredictionId?: string }) => 
              !img.url || 
              img.status === 'processing' || 
              img.status === 'pending' ||
              !!img.upscalePredictionId  // ✅ ถ้ากำลัง upscale ให้ถือว่ายัง incomplete
          )
          
          // ✅ แสดงรูปแม้เสร็จแล้ว (สำหรับ refresh)
          const hasImages = job.enhancedImageUrls.some((img: { url?: string }) => !!img.url)
          
          // ✅ เช็คว่า template กำลังประมวลผลหรือยัง
          const templateGen = job.templateGeneration || {}
          const hasTemplateProcessing = !!(
            templateGen.predictionId || // กำลังเจน template อยู่
            templateGen.upscalePredictionId || // กำลัง upscale template อยู่ (1:1)
            job.templatePredictionId || // legacy
            job.templateUpscalePredictionId // legacy
          )
          
          if (hasIncomplete || hasImages || hasTemplateProcessing) {
            const needsPolling = hasIncomplete || hasTemplateProcessing
            console.log(`🔄 ${needsPolling ? 'Resuming' : 'Loading completed'} job ${job.id} with ${job.enhancedImageUrls.length} images...`)
            console.log(`   hasIncomplete: ${hasIncomplete}, hasTemplateProcessing: ${hasTemplateProcessing}`)
            
            setProcessingJobId(needsPolling ? job.id : null)  // ✅ เสร็จแล้วไม่ต้อง set processing
            setCurrentJobId(job.id)
            setEnhancedImages(job.enhancedImageUrls)
            setReviewMode(true)
            
            if (hasIncomplete) {
              setProcessingStatus(`🔄 กำลังประมวลผล ${job.enhancedImageUrls.length} รูป...`)
            } else if (hasTemplateProcessing) {
              setProcessingStatus(`🎨 กำลังสร้าง Template...`)
            }
            
            // ✅ Set template URL if exists
            if (job.templateUrl) {
              console.log(`✅ Found existing template: ${job.templateUrl}`)
              setGeneratedTemplateUrl(job.templateUrl)
            }
            
            // ✅ Poll if incomplete OR template processing
            if (needsPolling) {
              setTimeout(() => pollJobStatus(job.id), 0)
            }
            break // Only resume one job at a time
          }
        } else {
          // Job just created, hasn't started processing yet
          console.log(`⏳ Job ${job.id} is pending, will poll for updates...`)
          setProcessingJobId(job.id)
          setCurrentJobId(job.id)
          setProcessingStatus(`⏳ กำลังเตรียมประมวลผล...`)
          
          // Start polling to wait for enhancedImageUrls to appear
          setTimeout(() => pollJobStatus(job.id), 2000)
          break
        }
      }
    } catch (error) {
      console.error('Error resuming jobs:', error)
    }
  }, [pollJobStatus]) // ✅ Now pollJobStatus is defined above

  useEffect(() => {
    if (!currentUser) return
    
    // ✅ ป้องกันเรียกซ้ำ - ใช้ ref เป็น flag
    let mounted = true
    
    const initDashboard = async () => {
      if (!mounted) return
      
      await fetchDashboardData()
      await fetchSpreadsheets()
      await fetchDriveFolders()
      
      // Auto-resume processing jobs (หลังจาก fetch data เสร็จแล้ว)
      if (mounted) resumeProcessingJobs()
    }
    
    initDashboard()
    
    // Check if coming from custom-prompt page
    const fromCustomPrompt = localStorage.getItem('fromCustomPrompt')
    const fromTextToImage = localStorage.getItem('fromTextToImage')
    const savedJobId = localStorage.getItem('processingJobId')
    
    if ((fromCustomPrompt === 'true' || fromTextToImage === 'true') && savedJobId) {
      localStorage.removeItem('fromCustomPrompt')
      localStorage.removeItem('fromTextToImage')
      localStorage.removeItem('processingJobId')
      
      // Show processing status IMMEDIATELY
      setProcessingStatus('⏳ กำลังเตรียมการประมวลผล...')
      setProcessingJobId(savedJobId)
      setCurrentJobId(savedJobId)
      
      // Start polling directly with the jobId (much faster!)
      console.log(`🎯 Direct polling for job ${savedJobId}`)
      setTimeout(() => pollJobStatus(savedJobId), 500)
    }
    
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]) // ✅ ลบ resumeProcessingJobs และ pollJobStatus ออก

  // ✅ Fetch storage status
  const fetchStorageStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/cleanup/enforce-limit')
      if (res.ok) {
        const data = await res.json()
        setStorageStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch storage status:', error)
    }
  }, [])

  // ✅ Poll storage status every 60 seconds (ลดเหลือ 1 นาที)
  useEffect(() => {
    if (currentUser) {
      fetchStorageStatus()
      const interval = setInterval(fetchStorageStatus, 60000)  // ✅ เปลี่ยนเป็น 60 วินาที
      return () => clearInterval(interval)
    }
  }, [currentUser, fetchStorageStatus])

  // ✅ Manual cleanup trigger
  async function handleManualCleanup() {
    setCleanupLoading(true)
    try {
      const res = await fetch('/api/cleanup/enforce-limit', { method: 'POST' })
      const data = await res.json()
      
      if (data.success) {
        alert(`✅ Cleanup success!\nDeleted: ${data.deleted} jobs\nCurrent: ${data.newTotal}/${data.limit} jobs`)
        fetchStorageStatus()
        fetchDashboardData()
      } else {
        alert(`❌ Cleanup failed: ${data.error}`)
      }
    } catch (error) {
      alert(`❌ Cleanup error: ${error instanceof Error ? error.message : 'Unknown'}`)
    } finally {
      setCleanupLoading(false)
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/users/logout', { method: 'POST' })
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }
  
  async function fetchDashboardData() {
    try {
      setLoading(true)

      const jobsRes = await fetch('/api/jobs?limit=100')
      const jobsData = await jobsRes.json()
      const jobs = jobsData.jobs || []

      // Calculate stats (รวม enhancing เข้ากับ processing)
      const newStats: JobStats = {
        pending: jobs.filter((j: Job) => j.status === 'pending').length,
        processing: jobs.filter((j: Job) => j.status === 'processing' || j.status === 'enhancing').length,
        completed: jobs.filter((j: Job) => j.status === 'completed').length,
        failed: jobs.filter((j: Job) => j.status === 'failed').length,
        approved: jobs.filter((j: Job) => j.status === 'approved').length,
        rejected: jobs.filter((j: Job) => j.status === 'rejected').length,
        total: jobs.length,
      }
      setStats(newStats)

      setRecentJobs(jobs)

      // Calculate user activities
      const userMap = new Map<string, UserActivity>()

      jobs.forEach((job: Job & { approvedAt?: string; rejectedAt?: string; approvedBy?: { id: string; name?: string; email: string } | string; rejectedBy?: { id: string; name?: string; email: string } | string }) => {
        if (job.createdBy) {
          const userId = typeof job.createdBy === 'string' ? job.createdBy : job.createdBy.id
          const userName =
            typeof job.createdBy === 'object' ? job.createdBy.name || job.createdBy.email : 'Unknown'
          const email = typeof job.createdBy === 'object' ? job.createdBy.email : ''

          if (!userMap.has(userId)) {
            userMap.set(userId, {
              userId,
              userName,
              email,
              jobsCreated: 0,
              jobsApproved: 0,
              jobsRejected: 0,
              lastActivity: job.createdAt,
            })
          }

          const activity = userMap.get(userId)!
          activity.jobsCreated++

          if (new Date(job.createdAt) > new Date(activity.lastActivity)) {
            activity.lastActivity = job.createdAt
          }
        }

        if (job.approvedBy) {
          const userId = typeof job.approvedBy === 'string' ? job.approvedBy : job.approvedBy.id
          const userName =
            typeof job.approvedBy === 'object'
              ? job.approvedBy.name || job.approvedBy.email
              : 'Unknown'
          const email = typeof job.approvedBy === 'object' ? job.approvedBy.email : ''

          if (!userMap.has(userId)) {
            userMap.set(userId, {
              userId,
              userName,
              email,
              jobsCreated: 0,
              jobsApproved: 0,
              jobsRejected: 0,
              lastActivity: job.approvedAt || job.createdAt,
            })
          }

          const activity = userMap.get(userId)!
          activity.jobsApproved++

          if (job.approvedAt && new Date(job.approvedAt) > new Date(activity.lastActivity)) {
            activity.lastActivity = job.approvedAt
          }
        }

        if (job.rejectedBy) {
          const userId = typeof job.rejectedBy === 'string' ? job.rejectedBy : job.rejectedBy.id
          const userName =
            typeof job.rejectedBy === 'object'
              ? job.rejectedBy.name || job.rejectedBy.email
              : 'Unknown'
          const email = typeof job.rejectedBy === 'object' ? job.rejectedBy.email : ''

          if (!userMap.has(userId)) {
            userMap.set(userId, {
              userId,
              userName,
              email,
              jobsCreated: 0,
              jobsApproved: 0,
              jobsRejected: 0,
              lastActivity: job.rejectedAt || job.createdAt,
            })
          }

          const activity = userMap.get(userId)!
          activity.jobsRejected++

          if (job.rejectedAt && new Date(job.rejectedAt) > new Date(activity.lastActivity)) {
            activity.lastActivity = job.rejectedAt
          }
        }
      })

      setUserActivities(Array.from(userMap.values()))
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchSpreadsheets() {
    try {
      const res = await fetch('/api/sheets/list')
      if (res.ok) {
        const data = await res.json()
        setSpreadsheets(data.spreadsheets || [])
      }
    } catch (error) {
      console.error('Error fetching spreadsheets:', error)
    }
  }

  async function fetchDriveFolders() {
    try {
      const res = await fetch('/api/drive/list-folders')
      if (res.ok) {
        const data = await res.json()
        const drives = data.drives || []
        setDriveFolders(drives)
        
        if (drives.length === 0) {
          console.warn('⚠️ No Google Drive folders found!')
          console.warn('Make sure to share folders with your Service Account email')
        } else {
          console.log(`✅ Loaded ${drives.length} drives with folders`)
        }
      }
    } catch (error) {
      console.error('Error fetching drive folders:', error)
    }
  }

  async function fetchSheetData() {
    if (!selectedSheetId) return
    
    try {
      const res = await fetch(`/api/sheets/${selectedSheetId}/data`)
      if (res.ok) {
        const data = await res.json()
        setSheetData(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching sheet data:', error)
    }
  }

  async function loadDriveImages() {
    const folderId = selectedFolderId || driveFolderId
    
    if (!folderId) {
      alert('กรุณาเลือกโฟลเดอร์ก่อน')
      return
    }
    
    try {
      const res = await fetch('/api/drive/list-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      })

      if (res.ok) {
        const data = await res.json()
        // Filter out invalid images
        const validImages = (data.images || []).filter((img: DriveImage) => 
          img && img.id && img.url && img.thumbnailUrl
        )
        setDriveImages(validImages)
        console.log(`✅ Loaded ${validImages.length} valid images from folder`)
      } else {
        const errorData = await res.json().catch(() => ({}))
        alert(`Failed to load images: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error loading drive images:', error)
      alert('Error loading images')
    }
  }

  function toggleImageSelection(image: DriveImage) {
    // Validate image object
    if (!image || !image.id || !image.url) {
      console.error('Invalid image object:', image)
      return
    }

    // Check if image already used in other sets
    const alreadyUsed = imageSets.some(set => 
      set.images.some(img => img.id === image.id)
    )
    if (alreadyUsed) {
      alert('❌ รูปนี้ถูกเลือกไปแล้วในชุดอื่น')
      return
    }

    setCurrentImages(prev => {
      const exists = prev.find(img => img && img.id === image.id)
      if (exists) {
        return prev.filter(img => img && img.id !== image.id)
      } else {
        // Check total limit including current sets
        const totalImagesInSets = imageSets.reduce((sum, set) => sum + set.images.length, 0)
        const MAX_IMAGES = 14
        if (totalImagesInSets + prev.length >= MAX_IMAGES) {
          alert(`❌ สามารถเลือกได้สูงสุด ${MAX_IMAGES} รูปเท่านั้น (เหลืออีก ${MAX_IMAGES - totalImagesInSets} รูป)`)
          return prev
        }
        return [...prev, image]
      }
    })
  }

  function addImageSet() {
    if (!currentSheetRow) {
      console.warn('⚠️ No sheet row selected')
      return
    }
    
    if (currentImages.length === 0) {
      console.warn('⚠️ No images selected')
      return
    }

    // Parse available photo types from sheet
    const photoTypeFromSheet = currentSheetRow['Photo_Type'] || ''
    const availableTypes = photoTypeFromSheet.split(',').map(t => t.trim()).filter(Boolean)

    // Validate: if multiple types, ensure all images have photo type selected
    if (availableTypes.length > 1) {
      const missingTypes = currentImages.filter(img => !imagePhotoTypes[img.id])
      if (missingTypes.length > 0) {
        alert(`❌ กรุณาเลือก Photo Type สำหรับรูปทั้งหมด (ขาดอีก ${missingTypes.length} รูป)`)
        return
      }
    }

    // Create images with photo types
    const imagesWithTypes = currentImages.map(img => ({
      ...img,
      photoType: availableTypes.length === 1 
        ? availableTypes[0] // Auto-assign if single type
        : (imagePhotoTypes[img.id] || availableTypes[0]) // Use selected or default
    }))

    // Add to sets
    setImageSets(prev => [...prev, {
      sheetRow: currentSheetRow,
      images: imagesWithTypes
    }])

    // Clear current selection
    setCurrentSheetRow(null)
    setCurrentImages([])
    setImagePhotoTypes({}) // Clear photo type selections
    
    alert(`✅ เพิ่มชุดสำเร็จ: ${currentImages.length} รูป`)
  }

  function removeImageSet(index: number) {
    setImageSets(prev => prev.filter((_, i) => i !== index))
  }

  function getTotalImageCount(): number {
    return imageSets.reduce((sum, set) => sum + set.images.length, 0)
  }

  async function createJob() {
    // Validation for set-based selection
    if (imageSets.length === 0) {
      console.warn('⚠️ No image sets added')
      return
    }

    const totalImages = getTotalImageCount()
    if (totalImages === 0) {
      console.warn('⚠️ No images found in sets')
      return
    }

    console.log('🚀 Starting job creation...')
    console.log('📦 Image sets:', imageSets.length)
    console.log('📊 Total images:', totalImages)

    setCreating(true)
    setReviewMode(false)
    setFinalImageUrl(null)
    setShowSuccess(false)
    setCompletedCount(0)
    setProcessingError('')

    try {
      // Create separate job for each image
      const jobIds: string[] = []
      const totalJobs = imageSets.reduce((sum, set) => sum + set.images.length, 0)
      
      console.log(`📦 Creating ${totalJobs} separate jobs...`)
      
      for (const set of imageSets) {
        for (const img of set.images) {
          const sheetRow = set.sheetRow
          
          console.log(`📋 Creating job for: ${img.photoType || sheetRow['Photo_Type']}`)
          
          // Create individual job
          const jobRes = await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productName: sheetRow['Product Name'] || 'Untitled',
              productDescription: sheetRow['Product Description'] || sheetRow['Description'] || '',
              contentTopic: sheetRow['Content_Topic'] || '',
              postTitleHeadline: sheetRow['Post_Title_Headline'] || '',
              contentDescription: sheetRow['Content_Description'] || '',
              photoTypeFromSheet: img.photoType || sheetRow['Photo_Type'] || undefined,
              referenceImageUrls: [{ url: img.url }], // Single image
              templateType: 'single', // Single image per job
              status: 'pending',
            }),
          })

          if (!jobRes.ok) {
            const errorData = await jobRes.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(errorData.error || `Failed to create job for ${img.photoType}`)
          }

          const response = await jobRes.json()
          const jobData = response.doc || response
          const jobId = jobData.id
          
          if (!jobId) {
            throw new Error('No job ID in response')
          }
          
          jobIds.push(jobId)
          console.log(`✅ Job created: ${jobId} (${img.photoType})`)
        }
      }
      
      console.log(`✅ Created ${jobIds.length} jobs`)

      // Process all jobs sequentially
      const allEnhancedImages: typeof enhancedImages = []
      
      for (let i = 0; i < jobIds.length; i++) {
        const jobId = jobIds[i]
        console.log(`\n🎯 Job ${i + 1}/${jobIds.length}: ${jobId}`)
        
        setCurrentJobId(jobId)
        setProcessingJobId(jobId)
        setProcessingStatus(`🎨 Processing image ${i + 1}/${jobIds.length}...`)

        // Start enhancement
        const processRes = await fetch('/api/generate/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: jobId }),
        })

        if (!processRes.ok) {
          const errorData = await processRes.json().catch(() => ({ error: 'Unknown error' }))
          console.error(`❌ Process failed:`, errorData)
          
          // Check if it's a payment/credit error
          const errorMsg = errorData.error || 'Processing failed'
          if (errorMsg.includes('402') || errorMsg.includes('Payment Required') || errorMsg.includes('Insufficient credit')) {
            setProcessingError('⚠️ Replicate หมดเครดิต - กรุณาเติมเครดิตที่ https://replicate.com/account/billing')
          } else {
            setProcessingError(`❌ Server Error: ${errorMsg}`)
          }
          
          setProcessingStatus('')
          setProcessingJobId(null)
          throw new Error(errorMsg)
        }

        // Poll for completion
        const maxPolls = 120 // 10 minutes
        let polls = 0
        
        while (polls < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, 5000))
          polls++
          
          try {
            const statusRes = await fetch(`/api/generate/process/status?jobId=${jobId}`)
            if (!statusRes.ok) continue
            
            const statusData = await statusRes.json()
            
            // Break when job is complete (success or failed)
            if (statusData.jobStatus === 'completed' || statusData.allComplete) {
              const firstImage = statusData.images?.[0]
              if (firstImage?.url) {
                allEnhancedImages.push({
                  ...firstImage,
                  photoType: firstImage.photoType || '',
                  contentTopic: firstImage.contentTopic || '',
                  postTitleHeadline: firstImage.postTitleHeadline || '',
                  contentDescription: firstImage.contentDescription || '',
                })
                console.log(`✅ Job ${i + 1}/${jobIds.length} done`)
              } else {
                console.log(`❌ Job ${i + 1}/${jobIds.length} failed`)
              }
              break
            }
          } catch (error) {
            console.error(`Poll error:`, error)
          }
        }
        
        if (polls >= maxPolls) {
          throw new Error(`Timeout for job ${i + 1}`)
        }
      }
      
      console.log(`✅ All ${jobIds.length} jobs completed`)
      // All jobs complete
      console.log(`✅ All ${allEnhancedImages.length} images completed`)
      setEnhancedImages(allEnhancedImages)
      setReviewMode(true)
      setProcessingStatus('')
      setProcessingJobId(null)
      
      // Show success message
      setCompletedCount(allEnhancedImages.length)
      setShowSuccess(true)

      // Refresh dashboard
      fetchDashboardData()
      
    } catch (error) {
      console.error('Error creating job:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      
      // Set error message if not already set
      if (!processingError) {
        if (errorMsg.includes('402') || errorMsg.includes('Payment Required') || errorMsg.includes('Insufficient credit')) {
          setProcessingError('⚠️ Replicate หมดเครดิต - กรุณาเติมเครดิตที่ https://replicate.com/account/billing')
        } else {
          setProcessingError(`❌ เกิดข้อผิดพลาด: ${errorMsg}`)
        }
      }
      
      setProcessingJobId(null)
      setProcessingStatus('')
      setCurrentJobId(null)
      setShowSuccess(false)
    } finally {
      setCreating(false)
    }
  }

  // NEW: Approve image (not currently used in UI)
  async function _handleApproveImage(index: number) {
    if (!currentJobId) return

    try {
      const res = await fetch('/api/generate/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: currentJobId,
          imageIndex: index,
          action: 'approve',
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to approve image')
      }

      const data = await res.json()
      
      // Update local state
      const updated = [...enhancedImages]
      updated[index].status = 'approved'
      setEnhancedImages(updated)

      // Check if all approved
      if (data.allApproved) {
        alert('✅ ทุกรูปได้รับการอนุมัติแล้ว! งานสำเร็จแล้ว')
      }
    } catch (error) {
      console.error('Approve error:', error)
      alert('Failed to approve image: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  // NEW: Regenerate image
  async function _handleRegenerateImage(index: number) {
    if (!currentJobId) return

    setRegeneratingIndex(index)

    try {
      console.log(`🔄 เจนรูปใหม่ ${index + 1}...`)
      
      const res = await fetch('/api/generate/process/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: currentJobId,
          imageIndex: index,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to regenerate image')
      }

      const data = await res.json()
      console.log(`✅ เริ่มเจนใหม่:`, data)
      
      // Update local state to show processing
      const updated = [...enhancedImages]
      updated[index] = {
        ...updated[index],
        status: 'pending',
        predictionId: data.predictionId,
        url: '',
      }
      setEnhancedImages(updated)

      // Resume polling
      pollJobStatus(currentJobId)

      alert('🎨 เริ่มเจนรูปใหม่แล้ว กรุณารอสักครู่...')
    } catch (error) {
      console.error('Regenerate error:', error)
      alert('❌ ไม่สามารถเจนใหม่ได้: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setRegeneratingIndex(null)
    }
  }

  // Complete job after all images done (no approval required)
  async function _handleCompleteJob() {
    if (!currentJobId) return

    const isImageReady = (img: (typeof enhancedImages)[number]) =>
      img.status === 'completed' && !!img.url && img.url.trim() !== '' && !img.upscalePredictionId

    const isImageFailed = (img: (typeof enhancedImages)[number]) => img.status === 'failed'

    // Check all images have either completed (including upscale) or failed
    const completedImages = enhancedImages.filter(isImageReady)
    const processingImages = enhancedImages.filter(img => !isImageReady(img) && !isImageFailed(img))
    const totalImages = enhancedImages.length
    
    if (processingImages.length > 0) {
      alert(`⏳ ยังมีรูปที่กำลังประมวลผลอยู่: ${processingImages.length}/${totalImages}\n\nกรุณารอให้เสร็จทั้งหมดก่อนบันทึกงาน`)
      return
    }
    
    // Show warning if some images failed
    const failedImages = totalImages - completedImages.length
    if (failedImages > 0) {
      const confirm = window.confirm(
        `⚠️ มีรูปที่ล้มเหลว ${failedImages} รูปจากทั้งหมด ${totalImages} รูป\n\n` +
        `คุณต้องการบันทึกงานด้วยรูปที่สำเร็จ ${completedImages.length} รูปหรือไม่?`
      )
      if (!confirm) return
    }

    setProcessingJobId(currentJobId)
    setProcessingStatus('✅ กำลังบันทึก...')

    try {
      // Mark job as completed
      const res = await fetch('/api/generate/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJobId }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to complete job')
      }

      const data = await res.json()
      
      if (data.status === 'completed') {
        alert('🎉 งานสำเร็จแล้ว! รูปทั้งหมดได้รับการปรับปรุงเรียบร้อย')
        setReviewMode(false)
        setProcessingStatus('')
        setProcessingJobId(null)
        fetchDashboardData()
        
        // Reset workflow
        handleResetWorkflow()
      } else {
        throw new Error('Job completion failed')
      }

    } catch (error) {
      console.error('Complete error:', error)
      alert('Failed to complete job: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setProcessingStatus('')
      setProcessingJobId(null)
    }
  }

  // NEW: Reset workflow
  function handleResetWorkflow() {
    setReviewMode(false)
    setCurrentJobId(null)
    setEnhancedImages([])
    setGeneratedTemplateUrl(null)
    setFinalImageUrl(null)
    setShowCreateForm(true)
    setCreating(false)
    setProcessingJobId(null)
    setProcessingStatus('')
    setRegeneratingIndex(null)
    // Keep selectedImages and other form data for re-submission
  }

  async function _handleApproveReject(jobId: string, action: 'approve' | 'reject') {
    try {
      await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          userId: 'current-user-id', // TODO: Get from auth
        }),
      })

      fetchDashboardData()
    } catch (error) {
      console.error(`Error ${action}ing job:`, error)
    }
  }

  function downloadImage(url: string, filename: string) {
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => {
        const blobUrl = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(blobUrl)
      })
      .catch((error) => {
        console.error('Error downloading image:', error)
        alert('Failed to download image')
      })
  }

  // Toggle expanded state for image cards
  function toggleExpanded(index: number | string) {
    setExpandedImageIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-100 text-gray-800'
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'approved':
        return 'bg-emerald-100 text-emerald-800'
      case 'rejected':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }
  
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">กำลังตรวจสอบ...</div>
      </div>
    )
  }

  if (!currentUser) {
    return null
  }

  const isAdmin = currentUser.role === 'admin'

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Main Container with Card Effect */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
          {/* Header */}
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">แดชบอร์ดสร้างภาพด้วย AI</h1>
              <p className="text-gray-600 mt-2">สร้างและจัดการภาพที่สร้างด้วย AI</p>
              <p className="text-sm text-gray-500 mt-1">
                ผู้ใช้: {currentUser.name || currentUser.email} {isAdmin && <span className="text-blue-600 font-semibold">(Admin)</span>}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleLogout}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                ออกจากระบบ
              </button>
              <Link
                href="/custom-prompt"
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-semibold shadow-lg hover:shadow-xl transition-all inline-block"
              >
                ⚡ Custom Prompt
              </Link>
              <Link
                href="/text-to-image"
                className="bg-gradient-to-r from-pink-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-pink-700 hover:to-purple-700 font-semibold shadow-lg hover:shadow-xl transition-all inline-block"
              >
                ✨ Text to Image
              </Link>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                {showCreateForm ? 'ปิด' : '+ สร้างงานใหม่'}
              </button>
            </div>
          </div>

        {/* Processing Status Banner */}
        {processingJobId && processingStatus && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-8 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <div>
                  <h3 className="text-lg font-bold text-blue-900">กำลังประมวลผล...</h3>
                  <p className="text-blue-700 text-sm mt-1">{processingStatus}</p>
                  <p className="text-blue-600 text-xs mt-1">อาจใช้เวลา 30-60 วินาที กรุณารอสักครู่...</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setProcessingJobId(null)
                  setProcessingStatus('')
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                ซ่อน
              </button>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {processingError && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-red-900">เกิดข้อผิดพลาด</h3>
                  <p className="text-red-700 text-sm mt-1 whitespace-pre-wrap">{processingError}</p>
                  <p className="text-red-600 text-xs mt-2">กรุณาแก้ไขปัญหาแล้วกดปุ่ม &quot;สร้างรูป&quot; อีกครั้ง</p>
                </div>
              </div>
              <button
                onClick={() => setProcessingError('')}
                className="text-red-600 hover:text-red-800 text-sm font-medium"
              >
                ปิด
              </button>
            </div>
          </div>
        )}

        {/* Success Banner */}
        {showSuccess && completedCount > 0 && (
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-green-900">✅ เสร็จแล้ว! สร้างรูปสำเร็จ {completedCount} ภาพ</h3>
                  <p className="text-green-700 text-sm mt-1">สามารถดูและดาวน์โหลดรูปได้ด้านล่าง</p>
                </div>
              </div>
              <button
                onClick={() => setShowSuccess(false)}
                className="text-green-600 hover:text-green-800 text-sm font-medium"
              >
                ปิด
              </button>
            </div>
          </div>
        )}

        {/* Create Job Form */}
        {showCreateForm && !creating && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-xl font-bold mb-4 text-black">สร้างงานสร้างภาพใหม่</h2>

            <form onSubmit={(e) => { e.preventDefault(); createJob(); }} className="space-y-4">
              {/* Select Google Sheet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลือกชีท Google
                </label>
                <select
                  className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
                  value={selectedSheetId}
                  onChange={(e) => {
                    setSelectedSheetId(e.target.value)
                    setCurrentSheetRow(null)
                    setSheetData([])
                  }}
                >
                  <option value="">-- เลือกชีท --</option>
                  {spreadsheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Load Sheet Data Button */}
              {selectedSheetId && (
                <button
                  type="button"
                  onClick={fetchSheetData}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                  โหลดข้อมูลสินค้าจากชีท
                </button>
              )}

              {/* Step 1: Select Sheet Row (Single Selection) */}
              {sheetData.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    1️⃣ เลือกข้อมูลจาก Google Sheet
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
                    value={sheetData.indexOf(currentSheetRow!) >= 0 ? sheetData.indexOf(currentSheetRow!) : ''}
                    onChange={(e) => {
                      const index = parseInt(e.target.value)
                      setCurrentSheetRow(isNaN(index) ? null : sheetData[index])
                    }}
                  >
                    <option value="">-- เลือกข้อมูล --</option>
                    {sheetData.map((row, index) => (
                      <option key={index} value={index}>
                        {row['Product Name'] || `Row ${index + 1}`} 
                        {row['Photo_Type'] && ` | ${row['Photo_Type']}`}
                        {row['Content_Topic'] && ` | ${row['Content_Topic']}`}
                      </option>
                    ))}
                  </select>

                  {/* Show Selected Row Details */}
                  {currentSheetRow && (
                    <div className="mt-3 bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-lg border-2 border-purple-200">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {Object.entries(currentSheetRow).map(([key, value]) => {
                          // Skip internal fields
                          if (key === 'id' || !value) return null
                          
                          return (
                            <div key={key}>
                              <span className="text-gray-600 font-medium">{key}:</span>
                              <div className="text-gray-900">{value as string}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Google Drive Images */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รูปอ้างอิงจาก Google Drive
                </label>
                <div className="space-y-3">
                  {/* Folder Tree View */}
                  {driveFolders.map((drive) => (
                    <div key={drive.driveId} className="mb-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                        <span>📱</span>
                        <span>{drive.driveName}</span>
                      </h3>
                      <FolderTree
                        folders={drive.folders}
                        onSelectFolder={(folderId) => {
                          setSelectedFolderId(folderId)
                          setDriveImages([])
                          setCurrentImages([])
                        }}
                        selectedFolderId={selectedFolderId}
                      />
                    </div>
                  ))}
                  
                  {driveFolders.length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-8 border border-gray-300 rounded-lg">
                      กำลังโหลดโฟลเดอร์...
                    </div>
                  )}
                  
                  {/* Manual Folder ID Input (Optional) */}
                  <details className="text-sm mt-4">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                      หรือใส่ Folder ID เอง
                    </summary>
                    <input
                      type="text"
                      placeholder="Folder ID (ถ้าไม่มีในรายการด้านบน)"
                      value={driveFolderId}
                      onChange={(e) => setDriveFolderId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-gray-900 mt-2"
                    />
                  </details>
                  
                  {/* Load Button */}
                  {(selectedFolderId || driveFolderId) && (
                    <button
                      type="button"
                      onClick={loadDriveImages}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 w-full font-medium"
                    >
                      📂 โหลดรูปจากโฟลเดอร์
                    </button>
                  )}
                </div>

                {/* Image Gallery */}
                {driveImages.length > 0 && (
                  <div className="mt-6 bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">2️⃣ เลือกรูปสำหรับชุดนี้</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          คลิกรูปเพื่อเลือก (สูงสุด {14 - getTotalImageCount()} รูป เหลือจาก 14 รูป)
                        </p>
                      </div>
                      <div className={`px-4 py-2 rounded-lg font-semibold ${
                        currentImages.length > 0
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {currentImages.length} รูปในชุดนี้
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {driveImages.filter(img => img && img.id && img.url).map((img) => {
                        const isSelected = currentImages.find(i => i && i.id === img.id)
                        const alreadyUsed = imageSets.some(set => set.images.some(i => i.id === img.id))
                        return (
                          <div
                            key={img.id}
                            onClick={() => !alreadyUsed && toggleImageSelection(img)}
                            className={`group relative rounded-xl overflow-hidden transition-all duration-300 ${
                              alreadyUsed
                                ? 'opacity-40 cursor-not-allowed ring-2 ring-gray-200'
                                : isSelected
                                  ? 'ring-4 ring-blue-500 shadow-xl scale-[1.02] cursor-pointer'
                                  : 'ring-2 ring-gray-300 hover:ring-gray-400 hover:shadow-lg cursor-pointer'
                            }`}
                          >
                            <div className="aspect-[4/3] relative bg-gray-200">
                              <Image
                                src={img.thumbnailUrl}
                                alt={img.name}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            {/* Overlay */}
                            <div className={`absolute inset-0 transition-opacity duration-300 ${
                              isSelected 
                                ? 'bg-blue-500/20' 
                                : alreadyUsed
                                  ? 'bg-gray-900/60'
                                  : 'bg-black/0 group-hover:bg-black/10'
                            }`} />
                            {/* Already Used Badge */}
                            {alreadyUsed && (
                              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-800 text-white px-3 py-1.5 rounded-full text-xs font-bold">
                                ✓ ใช้แล้ว
                              </div>
                            )}
                            {/* Checkmark */}
                            {isSelected && !alreadyUsed && (
                              <div className="absolute top-3 right-3 bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                            {/* Image Name */}
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                              <p className="text-white text-xs font-medium truncate">{img.name}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Photo Type Selection (if multiple types in sheet) */}
                    {currentSheetRow && currentImages.length > 0 && (() => {
                      const photoTypeFromSheet = currentSheetRow['Photo_Type'] || ''
                      const availableTypes = photoTypeFromSheet.split(',').map(t => t.trim()).filter(Boolean)
                      
                      // Only show dropdowns if there are multiple types
                      if (availableTypes.length > 1) {
                        return (
                          <div className="mt-6 pt-6 border-t border-gray-300">
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">
                              3️⃣ กำหนด Photo Type แต่ละรูป
                            </h4>
                            <p className="text-xs text-gray-600 mb-4">
                              ชีทระบุหลาย types ({availableTypes.join(', ')}) - กรุณาเลือก type สำหรับแต่ละรูป
                            </p>
                            <div className="space-y-3 max-h-96 overflow-y-auto">
                              {currentImages.map((img, _idx) => (
                                <div key={img.id} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200">
                                  <div className="flex-shrink-0 w-16 h-12 relative rounded overflow-hidden bg-gray-100">
                                    <Image
                                      src={img.thumbnailUrl}
                                      alt={img.name}
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-600 truncate">{img.name}</p>
                                  </div>
                                  <select
                                    value={imagePhotoTypes[img.id] || availableTypes[0]}
                                    onChange={(e) => {
                                      setImagePhotoTypes(prev => ({
                                        ...prev,
                                        [img.id]: e.target.value
                                      }))
                                    }}
                                    className="flex-shrink-0 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 bg-white hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    {availableTypes.map(type => (
                                      <option key={type} value={type}>
                                        {type}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      } else if (availableTypes.length === 1) {
                        // Single type - show info banner
                        return (
                          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800">
                              <span className="font-semibold">Photo Type:</span> {availableTypes[0]} (ตั้งค่าอัตโนมัติสำหรับทุกรูป)
                            </p>
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Add Set Button */}
                    {currentSheetRow && currentImages.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-gray-300">
                        <button
                          type="button"
                          onClick={addImageSet}
                          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-lg hover:from-green-700 hover:to-emerald-700 font-bold text-lg shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-3"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          ➕ เพิ่มชุดนี้เข้างาน ({currentImages.length} รูป)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Added Sets Display */}
              {imageSets.length > 0 && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl border-2 border-green-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-lg text-green-900">
                      ✅ ชุดที่เพิ่มแล้ว: {imageSets.length} ชุด ({getTotalImageCount()}/14 รูป)
                    </h3>
                    <div className="text-sm text-green-700 font-medium">
                      พร้อมสร้างงาน
                    </div>
                  </div>
                  
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {imageSets.map((set, index) => (
                      <div key={index} className="bg-white p-4 rounded-lg shadow-sm border border-green-100 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                                ชุดที่ {index + 1}
                              </span>
                              <h4 className="font-semibold text-gray-900">
                                {set.sheetRow['Product Name'] || 'Untitled'}
                              </h4>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                              <div>
                                <span className="text-gray-600">Photo Types: </span>
                                {(() => {
                                  // Count photo types in this set
                                  const typeCounts: Record<string, number> = {}
                                  set.images.forEach(img => {
                                    const type = img.photoType || 'unknown'
                                    typeCounts[type] = (typeCounts[type] || 0) + 1
                                  })
                                  return (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {Object.entries(typeCounts).map(([type, count]) => (
                                        <span key={type} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
                                          📷 {type} ({count})
                                        </span>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>
                              <div>
                                <span className="text-gray-600">จำนวนรูป: </span>
                                <span className="font-semibold text-gray-900">{set.images.length} รูป</span>
                              </div>
                            </div>
                            
                            {set.sheetRow['Content_Topic'] && (
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">หัวข้อ:</span> {set.sheetRow['Content_Topic']}
                              </div>
                            )}
                            {set.sheetRow['Post_Title_Headline'] && (
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">โพสต์:</span> {set.sheetRow['Post_Title_Headline']}
                              </div>
                            )}
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => removeImageSet(index)}
                            className="ml-3 text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                            title="ลบชุดนี้"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <div className="flex justify-end gap-3 pt-6 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={creating || imageSets.length === 0}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  {creating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      🎨 AI กำลังสร้าง...
                    </>
                  ) : (
                    <>
                      ✨ เริ่มปรับปรุงรูป ({getTotalImageCount()} รูป)
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================
            SECTION 2: IMAGE REVIEW
        ======================================== */}
        {reviewMode && enhancedImages.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            {/* Show Template Result if available */}
            {generatedTemplateUrl && (
              <div className="mb-8 pb-8 border-b-4 border-blue-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  🎨 <span>Template ที่สร้างเสร็จแล้ว</span>
                </h2>
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border-2 border-blue-300">
                  <div className="max-w-3xl mx-auto">
                    <div className="bg-white rounded-lg shadow-xl overflow-hidden border-2 border-gray-200">
                      <img
                        src={generatedTemplateUrl}
                        alt="Generated Template"
                        className="w-full h-auto"
                      />
                    </div>
                    <div className="flex gap-3 mt-4 justify-center">
                      <a
                        href={generatedTemplateUrl}
                        download={`template-${currentJobId}.png`}
                        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        ดาวน์โหลด Template
                      </a>
                      <button
                        onClick={() => {
                          const link = document.createElement('a')
                          link.href = generatedTemplateUrl
                          link.download = `template-${currentJobId}.png`
                          link.click()
                        }}
                        className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        แชร์
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{generatedTemplateUrl ? '🖼️ รูปที่ปรับปรุงแล้ว (ใช้สร้าง Template)' : '📸 รูปที่ปรับปรุงแล้ว'}</h2>
                <p className="text-gray-600 mt-1">
                  ดาวน์โหลดรูปที่เสร็จแล้วได้ทันที - รูปที่ยังไม่เสร็จจะแสดงเมื่อประมวลผลเสร็จ
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">
                  สำเร็จแล้ว: <span className="font-bold text-green-600">
                    {enhancedImages.filter(img => img.status === 'completed' && img.url && img.url.trim() !== '' && !img.upscalePredictionId).length} / {enhancedImages.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enhancedImages.map((img, index) => {
                const hasMetadata = img.photoType || img.contentTopic || img.postTitleHeadline
                const isReady = img.status === 'completed' && !!img.url && img.url.trim() !== '' && !img.upscalePredictionId
                const isUpscaling = !!img.upscalePredictionId && img.status === 'pending'
                return (
                  <div key={index} className="bg-white rounded-xl border-2 border-gray-200 shadow-sm hover:shadow-md transition-all overflow-hidden">
                    {/* Header with Status */}
                    <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-3 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900">รูปที่ {index + 1}</h3>
                        <div className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                          isReady ? 'bg-green-100 text-green-700' :
                          isUpscaling || img.status === 'processing' || img.status === 'pending' ? 'bg-blue-100 text-blue-700' :
                          img.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {isReady ? '✅ เสร็จแล้ว' :
                           isUpscaling ? '⏳ Upscale' :
                           img.status === 'processing' || img.status === 'pending' ? '⏳ ประมวลผล' :
                           img.status === 'failed' ? '❌ ล้มเหลว' :
                           '⏳ รอคิว'}
                        </div>
                      </div>
                      
                      {/* Metadata - Always show if available */}
                      {hasMetadata && (
                        <div className="mt-2 space-y-1.5">
                          {img.photoType && (
                            <div>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-600 text-white">
                                📷 {img.photoType}
                              </span>
                            </div>
                          )}
                          {img.contentTopic && (
                            <div className="text-xs">
                              <span className="text-gray-600">หัวข้อ: </span>
                              <span className="text-gray-900 font-medium">{img.contentTopic}</span>
                            </div>
                          )}
                          {img.postTitleHeadline && (
                            <div className="text-xs">
                              <span className="text-gray-600">โพสต์: </span>
                              <span className="text-gray-900">{img.postTitleHeadline}</span>
                            </div>
                          )}

                          {/* Expandable Content Description */}
                          {img.contentDescription && (
                            <div className="mt-2">
                              <button
                                onClick={() => toggleExpanded(index)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                              >
                                <span>{expandedImageIds.has(index) ? '▲' : '▼'}</span>
                                <span>{expandedImageIds.has(index) ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดเพิ่มเติม'}</span>
                              </button>
                              {expandedImageIds.has(index) && (
                                <div className="mt-2 p-3 border border-gray-300 rounded-lg bg-gray-50">
                                  <div className="text-xs">
                                    <span className="text-gray-600 font-semibold">รายละเอียดเนื้อหา:</span>
                                    <p className="text-gray-800 mt-1 whitespace-pre-wrap">{img.contentDescription}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Enhanced Image */}
                    <div className="relative aspect-[4/3] bg-gray-100">
                      {isReady ? (
                        <Image
                          src={img.url!}
                          alt={`Enhanced ${index + 1}`}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-3">
                          {isUpscaling ? (
                            <>
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                              <span className="text-xs font-medium">กำลัง upscale...</span>
                            </>
                          ) : img.status === 'processing' || img.status === 'pending' ? (
                            <>
                              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                              <span className="text-xs font-medium">กำลังประมวลผล...</span>
                            </>
                          ) : img.status === 'failed' ? (
                            <>
                              <span className="text-3xl">❌</span>
                              <span className="text-xs font-medium">ล้มเหลว</span>
                            </>
                          ) : (
                            <>
                              <span className="text-3xl">⏳</span>
                              <span className="text-xs font-medium">รอคิว...</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="p-3">
                      {isReady ? (
                        <button
                          onClick={() => downloadImage(img.url!, `${img.photoType || 'enhanced'}-${index + 1}-${Date.now()}.jpg`)}
                          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2.5 rounded-lg hover:from-blue-700 hover:to-purple-700 font-medium text-sm shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
                        >
                          <span>💾</span>
                          <span>ดาวน์โหลด</span>
                        </button>
                      ) : isUpscaling ? (
                        <div className="w-full bg-blue-50 border border-blue-200 text-blue-700 py-2.5 rounded-lg font-medium text-sm text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin">⏳</div>
                            <span>กำลัง upscale...</span>
                          </div>
                          <div className="text-xs text-blue-600 mt-1">โปรดรอสักครู่</div>
                        </div>
                      ) : img.status === 'failed' ? (
                        <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3">
                          <div className="text-sm text-red-800 space-y-1">
                            <div className="font-semibold">❌ เกิดข้อผิดพลาด</div>
                            {img.error && (
                              <div className="text-xs text-red-600 line-clamp-2 mb-2">
                                {img.error}
                              </div>
                            )}
                            <div className="text-xs text-red-700">
                              กรุณากดปุ่ม &quot;สร้างรูป&quot; เพื่อเจนใหม่
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full bg-blue-50 border border-blue-200 text-blue-700 py-2.5 rounded-lg font-medium text-sm text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin">⏳</div>
                            <span>กำลังเจนรูป...</span>
                          </div>
                          <div className="text-xs text-blue-600 mt-1">โปรดรอ 30-60 วินาที</div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Reset Button */}
            <div className="mt-6 pt-6 border-t-2 border-gray-200 flex justify-center">
              <button
                onClick={handleResetWorkflow}
                className="bg-gray-600 text-white px-8 py-3 rounded-lg hover:bg-gray-700 font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                ← เริ่มสร้างงานใหม่
              </button>
            </div>
          </div>
        )}

        {/* View Generated Images Modal */}
        {viewingJob && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    {viewingJob.productName && viewingJob.productName !== 'Untitled' && (
                      <h2 className="text-2xl font-bold text-gray-900">{viewingJob.productName}</h2>
                    )}
                    {viewingJob.contentTopic && (
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">contentTopic</span> {viewingJob.contentTopic}
                      </div>
                    )}
                    {viewingJob.postTitleHeadline && (
                      <div className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">postTitleHeadline</span> {viewingJob.postTitleHeadline}
                      </div>
                    )}
                    {(viewingJob as Job & { customPrompt?: string }).customPrompt && (
                      <div className="mt-3 p-3 bg-purple-50 border-2 border-purple-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <span className="text-purple-700 font-bold text-sm">⚡ Custom Prompt:</span>
                          <p className="text-purple-900 text-sm whitespace-pre-wrap flex-1">{(viewingJob as Job & { customPrompt?: string }).customPrompt}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        // Clear all image errors to force reload
                        setImageLoadErrors({})
                      }}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      title="Refresh all images"
                    >
                      🔄 Refresh Images
                    </button>
                    <button
                      onClick={() => setViewingJob(null)}
                      className="text-gray-500 hover:text-gray-700 text-2xl ml-2"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Show Template Result if available */}
                {viewingJob.templateUrl && (
                  <div className="mt-8 pt-8 border-t-4 border-blue-200">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      🎨 <span>Template ที่สร้างเสร็จแล้ว</span>
                    </h3>
                    <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border-2 border-blue-300">
                      <div className="max-w-3xl mx-auto">
                        <div className="bg-white rounded-lg shadow-xl overflow-hidden border-2 border-gray-200">
                          <img
                            src={viewingJob.templateUrl}
                            alt="Generated Template"
                            className="w-full h-auto"
                          />
                        </div>
                        <div className="flex gap-3 mt-4 justify-center">
                          <a
                            href={viewingJob.templateUrl}
                            download={`template-${viewingJob.id}.png`}
                            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            ดาวน์โหลด Template
                          </a>
                          <button
                            onClick={() => {
                              const link = document.createElement('a')
                              link.href = viewingJob.templateUrl!
                              link.download = `template-${viewingJob.id}.png`
                              link.click()
                            }}
                            className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                            </svg>
                            แชร์
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show Enhanced Images if available */}
                {viewingJob.enhancedImageUrls && viewingJob.enhancedImageUrls.length > 0 ? (
                  <div className={viewingJob.templateUrl ? "mt-8 pt-8 border-t-2 border-gray-200" : ""}>
                    {viewingJob.templateUrl && (
                      <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        🖼️ <span>รูปที่ปรับปรุงแล้ว (ใช้สร้าง Template)</span>
                      </h3>
                    )}
                    {/* Image loading status */}
                    {Object.keys(imageLoadErrors).filter(k => k.startsWith(`modal-${viewingJob.id}`)).length > 0 && (
                      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          ⚠️ บางรูปโหลดไม่สำเร็จ ({Object.keys(imageLoadErrors).filter(k => k.startsWith(`modal-${viewingJob.id}`)).length} รูป) - 
                          <button 
                            onClick={() => setImageLoadErrors({})} 
                            className="ml-2 text-blue-600 hover:underline font-medium"
                          >
                            คลิกเพื่อโหลดใหม่
                          </button>
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {viewingJob.enhancedImageUrls.map((img, index) => {
                        const hasMetadata = img.photoType || img.contentTopic || img.postTitleHeadline
                        
                        // Check if image failed
                        const isFailed = img.status === 'failed' || (!img.url && !img.predictionId)
                        
                        // Validate URL before normalizing
                        let imageUrl: string | null = null
                        if (img.url) {
                          try {
                            new URL(img.url) // Validate it's a real URL
                            imageUrl = normalizeImageUrl(img.url)
                          } catch {
                            console.error(`Invalid URL for image ${index + 1}:`, img.url)
                            imageUrl = null
                          }
                        }
                        
                        // Detect URL type for debugging
                        const urlType = imageUrl 
                          ? imageUrl.includes('replicate.delivery') ? 'Replicate (อาจหมดอายุ)' 
                          : imageUrl.includes('vercel-storage.com') ? 'Vercel Storage'
                          : imageUrl.includes('drive.google.com') || imageUrl.includes('googleusercontent.com') ? 'Google Drive'
                          : 'Unknown'
                          : 'No URL'
                        
                        console.log(`Image ${index + 1} Original:`, img.url, 'Normalized:', imageUrl, 'Status:', img.status, 'Type:', urlType)
                        
                        // Show failed images with error placeholder
                        if (isFailed) {
                          return (
                            <div key={`modal-${viewingJob.id}-${index}`} className="bg-white rounded-lg border-2 border-red-200 shadow-sm overflow-hidden">
                              <div className="relative aspect-[4/3] bg-red-50 flex items-center justify-center">
                                <div className="text-center p-4">
                                  <span className="text-red-400 text-5xl block mb-3">❌</span>
                                  <span className="text-sm font-semibold text-red-600 block mb-1">รูปที่ {index + 1} ไม่สำเร็จ</span>
                                  <span className="text-xs text-red-500">ไม่สามารถสร้างรูปนี้ได้</span>
                                </div>
                              </div>
                              {hasMetadata && (
                                <div className="p-3 bg-gray-50 border-t border-red-200">
                                  {img.photoType && <p className="text-xs text-gray-600 mb-1"><strong>ประเภท:</strong> {img.photoType}</p>}
                                  {img.contentTopic && <p className="text-xs text-gray-600 mb-1"><strong>หัวข้อ:</strong> {img.contentTopic}</p>}
                                  {img.postTitleHeadline && <p className="text-xs text-gray-600"><strong>หัวเรื่อง:</strong> {img.postTitleHeadline}</p>}
                                </div>
                              )}
                            </div>
                          )
                        }
                        
                        return imageUrl ? (
                          <div key={`modal-${viewingJob.id}-${index}`} className="bg-white rounded-lg border-2 border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                            {/* Image */}
                            <div className="relative aspect-[4/3] bg-gray-100">
                              {!imageLoadErrors[`modal-${viewingJob.id}-${index}`] ? (
                                <Image
                                  key={`modal-${viewingJob.id}-${index}-${viewingJob.updatedAt || viewingJob.createdAt}`}
                                  src={imageUrl}
                                  alt={`Enhanced ${index + 1}`}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                  priority={index < 3}
                                  onError={(e) => {
                                    console.error('Modal image load error:', index, imageUrl)
                                    setImageLoadErrors(prev => ({
                                      ...prev,
                                      [`modal-${viewingJob.id}-${index}`]: (prev[`modal-${viewingJob.id}-${index}`] || 0) + 1
                                    }))
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                  }}
                                  onLoad={() => {
                                    setImageLoadErrors(prev => {
                                      const newErrors = { ...prev }
                                      delete newErrors[`modal-${viewingJob.id}-${index}`]
                                      return newErrors
                                    })
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                  <div className="text-center">
                                    <span className="text-gray-400 text-4xl block mb-2">🖼️</span>
                                    <span className="text-xs text-gray-500">ไม่สามารถโหลดรูปภาพ</span>
                                    <button
                                      onClick={() => {
                                        setImageLoadErrors(prev => {
                                          const newErrors = { ...prev }
                                          delete newErrors[`modal-${viewingJob.id}-${index}`]
                                          return newErrors
                                        })
                                      }}
                                      className="mt-2 text-xs text-blue-600 hover:underline block mx-auto"
                                    >
                                      🔄 ลองใหม่
                                    </button>
                                  </div>
                                </div>
                              )}
                              {/* Image Number Badge */}
                              <div className="absolute top-2 left-2 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded">
                                #{index + 1}
                              </div>
                            </div>
                            
                            {/* Metadata Section */}
                            {hasMetadata && (
                              <div className="p-4 border-b border-gray-100 bg-gradient-to-br from-blue-50 to-purple-50">
                                {/* Photo Type Badge */}
                                {img.photoType && (
                                  <div className="mb-2">
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white">
                                      📷 {img.photoType}
                                    </span>
                                  </div>
                                )}
                                
                                {/* Content Topic */}
                                {img.contentTopic && (
                                  <div className="mb-2">
                                    <div className="text-xs text-gray-600 font-medium mb-1">contentTopic</div>
                                    <div className="text-sm text-gray-900 font-medium">{img.contentTopic}</div>
                                  </div>
                                )}
                                
                                {/* Post Title / Headline */}
                                {img.postTitleHeadline && (
                                  <div className="mb-2">
                                    <div className="text-xs text-gray-600 font-medium mb-1">postTitleHeadline</div>
                                    <div className="text-sm text-gray-900">{img.postTitleHeadline}</div>
                                  </div>
                                )}
                                
                                {/* Expandable Content Description */}
                                {img.contentDescription && (
                                  <div className="mt-2">
                                    <button
                                      onClick={() => toggleExpanded(`view-${index}`)}
                                      className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                    >
                                      <span>{expandedImageIds.has(`view-${index}`) ? '▲' : '▼'}</span>
                                      <span>{expandedImageIds.has(`view-${index}`) ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดเพิ่มเติม'}</span>
                                    </button>
                                    {expandedImageIds.has(`view-${index}`) && (
                                      <div className="mt-2 p-3 border border-gray-300 rounded-lg bg-white">
                                        <div className="text-xs">
                                          <span className="text-gray-600 font-semibold">รายละเอียดเนื้อหา:</span>
                                          <p className="text-gray-800 mt-1 whitespace-pre-wrap">{img.contentDescription}</p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Download Button */}
                            <div className="p-3">
                              <button
                                onClick={() => downloadImage(img.url!, `${viewingJob.productName}_${img.photoType || 'enhanced'}_${index + 1}.jpg`)}
                                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2.5 rounded-lg hover:from-blue-700 hover:to-purple-700 font-medium text-sm flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                ดาวน์โหลดรูป
                              </button>
                            </div>
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>
                ) : viewingJob.generatedImages ? (
                  <div>
                    <h3 className="font-semibold mb-4 text-lg">📱 รูปตามขนาดแพลตฟอร์ม (Template)</h3>
                    {/* Platform Selector */}
                    <div className="flex gap-2 mb-4">
                      {Object.entries(IMAGE_SIZES).map(([key, size]) => {
                        const hasImage = viewingJob.generatedImages?.[key as keyof typeof IMAGE_SIZES]
                        return (
                          <button
                            key={key}
                            onClick={() => setSelectedPlatform(key as keyof typeof IMAGE_SIZES)}
                            disabled={!hasImage}
                            className={`px-4 py-2 rounded-lg font-medium ${
                              selectedPlatform === key
                                ? 'bg-blue-600 text-white'
                                : hasImage
                                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {size.label}
                            <div className="text-xs mt-1">
                              {size.width}×{size.height}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Image Display */}
                    {viewingJob.generatedImages[selectedPlatform] ? (
                      <div className="space-y-4">
                        <div className="relative border-2 border-gray-200 rounded-lg overflow-hidden">
                          <Image
                            src={viewingJob.generatedImages[selectedPlatform]!.url}
                            alt={`${IMAGE_SIZES[selectedPlatform].label} Image`}
                            width={IMAGE_SIZES[selectedPlatform].width}
                            height={IMAGE_SIZES[selectedPlatform].height}
                            className="w-full h-auto"
                            unoptimized
                          />
                        </div>

                        {/* Download Button */}
                        <button
                          onClick={() =>
                            downloadImage(
                              viewingJob.generatedImages![selectedPlatform]!.url,
                              `${viewingJob.productName}_${selectedPlatform}_${IMAGE_SIZES[selectedPlatform].width}x${IMAGE_SIZES[selectedPlatform].height}.png`,
                            )
                          }
                          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 font-semibold flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          ดาวน์โหลด {IMAGE_SIZES[selectedPlatform].label} ({IMAGE_SIZES[selectedPlatform].width}×{IMAGE_SIZES[selectedPlatform].height})
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">ไม่มีภาพสำหรับแพลตฟอร์มนี้</div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">ไม่มีรูปภาพ</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">งานทั้งหมด</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">รอดำเนินการ</div>
            <div className="text-3xl font-bold text-gray-600 mt-2">{stats.pending}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">กำลังประมวลผล</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">{stats.processing}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">เสร็จสมบูรณ์</div>
            <div className="text-3xl font-bold text-green-600 mt-2">{stats.completed}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">อนุมัติแล้ว</div>
            <div className="text-3xl font-bold text-emerald-600 mt-2">{stats.approved}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">ปฏิเสธแล้ว</div>
            <div className="text-3xl font-bold text-orange-600 mt-2">{stats.rejected}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">ล้มเหลว</div>
            <div className="text-3xl font-bold text-red-600 mt-2">{stats.failed}</div>
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">งานทั้งหมด ({recentJobs.length})</h2>
          </div>
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    รูปภาพ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ขนาด
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สร้างโดย
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สร้างเมื่อ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    การกระทำ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      ไม่พบงาน สร้างงานแรกของคุณ!
                    </td>
                  </tr>
                ) : (
                  recentJobs.map((job) => {
                    const firstImage = job.enhancedImageUrls?.[0]
                    
                    // Validate URL is actually a valid URL
                    const isValidUrl = (url: string | undefined) => {
                      if (!url || url.length < 10) return false
                      try {
                        new URL(url)
                        return true
                      } catch {
                        return false
                      }
                    }
                    
                    // Choose the best valid URL: prefer url if valid, otherwise use originalUrl
                    let thumbnailUrl: string | undefined
                    if (firstImage && isValidUrl(firstImage.url)) {
                      thumbnailUrl = firstImage.url
                    } else if (firstImage && isValidUrl(firstImage.originalUrl)) {
                      thumbnailUrl = firstImage.originalUrl
                    }
                    
                    // Only normalize Google Drive URLs, leave others as-is
                    if (thumbnailUrl && isGoogleDriveUrl(thumbnailUrl)) {
                      thumbnailUrl = getGoogleDriveThumbnail(thumbnailUrl)
                    }
                    
                    return (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          {thumbnailUrl && !imageLoadErrors[`job-${job.id}`] ? (
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                              <Image
                                key={`job-${job.id}-${job.updatedAt || job.createdAt}`}
                                src={thumbnailUrl}
                                alt="Thumbnail"
                                fill
                                className="object-cover"
                                unoptimized
                                priority={false}
                                loading="lazy"
                                onError={(e) => {
                                  console.error('Thumbnail load error for job:', job.id, thumbnailUrl)
                                  setImageLoadErrors(prev => ({
                                    ...prev,
                                    [`job-${job.id}`]: (prev[`job-${job.id}`] || 0) + 1
                                  }))
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                }}
                                onLoad={() => {
                                  // Clear error on successful load
                                  setImageLoadErrors(prev => {
                                    const newErrors = { ...prev }
                                    delete newErrors[`job-${job.id}`]
                                    return newErrors
                                  })
                                }}
                              />
                              {imageLoadErrors[`job-${job.id}`] && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                                  <span className="text-gray-400 text-2xl">🖼️</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                              <span className="text-gray-400 text-2xl">🖼️</span>
                            </div>
                          )}
                          <div className="flex flex-col">
                            {job.contentTopic && (
                              <div className="text-sm font-medium text-gray-900">{job.contentTopic}</div>
                            )}
                            {job.postTitleHeadline && (
                              <div className="text-xs text-gray-500">{job.postTitleHeadline}</div>
                            )}
                            {!job.contentTopic && !job.postTitleHeadline && (
                              <div className="text-sm text-gray-400">ไม่มีหัวข้อ</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(job.status)}`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          const sizeLabels: Record<string, string> = {
                            '1:1-2K': '2048×2048',
                            '4:5-2K': '1080×1350',
                            '9:16-2K': '1080×1920',
                          }
                          const outputSize = job.outputSize || '1:1-2K'
                          return (
                            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                              {sizeLabels[outputSize] || outputSize}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {job.createdBy
                            ? typeof job.createdBy === 'object'
                              ? job.createdBy.name || job.createdBy.email
                              : 'Unknown'
                            : 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {new Date(job.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        {/* ✅ แสดงปุ่มดูความคืบหน้าสำหรับ processing และ enhancing */}
                        {(job.status === 'processing' || job.status === 'enhancing') && 
                         job.enhancedImageUrls && 
                         job.enhancedImageUrls.length > 0 && (
                          <button
                            onClick={() => {
                              setCurrentJobId(job.id)
                              setProcessingJobId(job.id)
                              setEnhancedImages(job.enhancedImageUrls || [])
                              setReviewMode(true)
                              pollJobStatus(job.id)
                            }}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                          >
                            🔄 ดูความคืบหน้า
                          </button>
                        )}
                        {(job.status === 'completed' ||
                          job.status === 'approved' ||
                          job.status === 'rejected') &&
                          (job.generatedImages || job.enhancedImageUrls) && (
                            <button
                              onClick={async () => {
                                setImageLoadErrors({})
                                
                                // Fetch latest job to get templateUrl
                                try {
                                  const response = await fetch(`/api/jobs/${job.id}`)
                                  if (response.ok) {
                                    const latestJob = await response.json()
                                    setViewingJob(latestJob)
                                  } else {
                                    setViewingJob(job)
                                  }
                                } catch (error) {
                                  setViewingJob(job)
                                }
                              }}
                              className="text-purple-600 hover:text-purple-900 font-medium"
                            >
                              🖼️ ดูรูป
                            </button>
                          )}
                        <button
                          onClick={async () => {
                            if (confirm('ลบงานนี้?')) {
                              await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
                              fetchDashboardData()
                            }
                          }}
                          className="text-gray-600 hover:text-red-600"
                        >
                          🗑️ ลบ
                        </button>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ========================================
            STORAGE STATUS & CLEANUP (BOTTOM SECTION)
        ======================================== */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 mt-8">
          <div className="flex gap-4">
            {/* Storage Status Card */}
            {storageStatus && (
              <div className={`flex-1 rounded-xl border-2 p-4 ${
                storageStatus.status === 'healthy' ? 'bg-green-50 border-green-300' :
                storageStatus.status === 'warning' ? 'bg-yellow-50 border-yellow-300' :
                'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">
                    {storageStatus.status === 'healthy' ? '✅' :
                     storageStatus.status === 'warning' ? '⚠️' : '🚨'}
                  </span>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">Storage Status</h3>
                    <p className="text-sm text-gray-600">
                      Last updated: {new Date(storageStatus.timestamp).toLocaleTimeString('th-TH')}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <div>
                    <p className="text-sm text-gray-600">Jobs</p>
                    <p className="text-xl font-bold text-gray-900">{storageStatus.usage}</p>
                    <p className="text-xs text-gray-500">({storageStatus.usagePercent}%)</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Estimated Storage</p>
                    <p className="text-xl font-bold text-gray-900">{storageStatus.estimatedStorageMB} MB</p>
                    <p className="text-xs text-gray-500">~{storageStatus.storagePercent}% of 1GB</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <p className={`text-xl font-bold ${
                      storageStatus.status === 'healthy' ? 'text-green-600' :
                      storageStatus.status === 'warning' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>
                      {storageStatus.status === 'healthy' ? 'Healthy' :
                       storageStatus.status === 'warning' ? 'Warning' : 'Critical'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Force Cleanup Button Card */}
            {storageStatus && (
              <div className="flex items-center">
                <button
                  onClick={handleManualCleanup}
                  disabled={cleanupLoading}
                  className={`px-8 py-6 rounded-xl font-bold text-black transition-all border-2 shadow-lg ${
                    cleanupLoading
                      ? 'bg-gray-300 border-gray-400 cursor-not-allowed'
                      : storageStatus.status === 'critical'
                      ? 'bg-red-100 border-red-400 hover:bg-red-200'
                      : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {cleanupLoading ? '🔄 Cleaning...' : '🗑️ Force Cleanup'}
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
