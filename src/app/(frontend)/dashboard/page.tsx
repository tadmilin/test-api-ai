'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import TemplateTypeSelector from '@/components/TemplateTypeSelector'
import StyleSelector from '@/components/StyleSelector'

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
  createdBy?: {
    id: string
    name: string
    email: string
  }
  generatedPrompt?: string
  generatedImages?: {
    facebook?: { url: string; width: number; height: number }
    instagram_feed?: { url: string; width: number; height: number }
    instagram_story?: { url: string; width: number; height: number }
  }
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
  const [selectedSheetRow, setSelectedSheetRow] = useState<SheetData | null>(null)
  const [driveFolderId, setDriveFolderId] = useState<string>('')
  const [driveImages, setDriveImages] = useState<DriveImage[]>([])
  const [selectedImages, setSelectedImages] = useState<DriveImage[]>([])
  const [creating, setCreating] = useState(false)
  
  // Template Settings (AI mode only)
  const [templateType, setTemplateType] = useState<'single' | 'dual' | 'triple' | 'quad'>('triple')
  const [templateStyle, setTemplateStyle] = useState<'minimal' | 'classic' | 'graphic'>('minimal')
  
  // Review & Finalize States
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [enhancedImages, setEnhancedImages] = useState<Array<{url: string, status: string, originalUrl: string}>>([])
  const [reviewMode, setReviewMode] = useState(false)
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [finalImageUrl, setFinalImageUrl] = useState<string | null>(null)

  // View Generated Images
  const [viewingJob, setViewingJob] = useState<Job | null>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<keyof typeof IMAGE_SIZES>('facebook')

  // Processing status
  const [processingJobId, setProcessingJobId] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string>('')

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

  useEffect(() => {
    if (currentUser) {
      fetchDashboardData()
      fetchSpreadsheets()
    }
  }, [currentUser])

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

      // Calculate stats
      const newStats: JobStats = {
        pending: jobs.filter((j: Job) => j.status === 'pending').length,
        processing: jobs.filter((j: Job) => j.status === 'processing').length,
        completed: jobs.filter((j: Job) => j.status === 'completed').length,
        failed: jobs.filter((j: Job) => j.status === 'failed').length,
        approved: jobs.filter((j: Job) => j.status === 'approved').length,
        rejected: jobs.filter((j: Job) => j.status === 'rejected').length,
        total: jobs.length,
      }
      setStats(newStats)

      setRecentJobs(jobs.slice(0, 10))

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
    try {
      let url = '/api/drive/list-all-images'
      let options: RequestInit = {}

      // ถ้ามี Folder ID ให้ใช้ list-folder แทน
      if (driveFolderId) {
        url = '/api/drive/list-folder'
        options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: driveFolderId }),
        }
      }

      const res = await fetch(url, options)

      if (res.ok) {
        const data = await res.json()
        // Filter out invalid images
        const validImages = (data.images || []).filter((img: DriveImage) => 
          img && img.id && img.url && img.thumbnailUrl
        )
        setDriveImages(validImages)
        console.log(`✅ Loaded ${validImages.length} valid images`)
      } else {
        alert('Failed to load images')
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

    setSelectedImages(prev => {
      const exists = prev.find(img => img && img.id === image.id)
      if (exists) {
        return prev.filter(img => img && img.id !== image.id)
      } else {
        // Limit based on template type
        const maxImages = templateType === 'single' ? 1 : templateType === 'dual' ? 2 : templateType === 'triple' ? 3 : 4
        if (prev.length >= maxImages) {
          alert(`สามารถเลือกได้สูงสุด ${maxImages} รูปสำหรับ Template ${templateType}`)
          return prev
        }
        return [...prev, image]
      }
    })
  }

  async function createJob() {
    if (!selectedSheetRow) {
      alert('Please select product data from sheet')
      return
    }
    
    if (selectedImages.length === 0) {
      alert('Please select at least 1 image')
      return
    }

    // Validate template type matches selected images
    const requiredImages = templateType === 'single' ? 1 : templateType === 'dual' ? 2 : templateType === 'triple' ? 3 : 4
    if (selectedImages.length < requiredImages) {
      alert(`กรุณาเลือกรูปอย่างน้อย ${requiredImages} รูปสำหรับ Template ${templateType}`)
      return
    }

    // Filter out any undefined images
    const validImages = selectedImages.filter(img => img && img.id && img.url)
    if (validImages.length === 0) {
      alert('ไม่พบรูปภาพที่ถูกต้อง กรุณาเลือกรูปใหม่')
      return
    }

    setCreating(true)
    setReviewMode(false)
    setFinalImageUrl(null)

    try {
      // Create job with new template settings
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selectedSheetRow['Product Name'] || 'Untitled',
          productDescription: selectedSheetRow['Product Description'] || selectedSheetRow['Description'] || '',
          contentTopic: selectedSheetRow['Content_Topic'] || '',
          postTitleHeadline: selectedSheetRow['Post_Title_Headline'] || '',
          contentDescription: selectedSheetRow['Content_Description'] || '',
          photoTypeFromSheet: selectedSheetRow['Photo_Type'] || undefined,
          referenceImageIds: validImages.map((img) => ({ imageId: img.id })),
          referenceImageUrls: validImages.map((img) => ({ url: img.url })),
          
          // Template settings (AI mode only)
          templateType: templateType,
          templateMode: 'ai',
          templateStyle: templateStyle,
          
          status: 'pending',
        }),
      })

      if (!jobRes.ok) {
        const errorData = await jobRes.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to create job')
      }

      const response = await jobRes.json()
      console.log('✅ Job created:', response)

      // Handle both response formats: {doc: job} or job directly
      const jobData = response.doc || response
      const jobId = jobData.id
      
      if (!jobId) {
        throw new Error('No job ID in response')
      }

      // Set states for review workflow
      setCurrentJobId(jobId)
      setProcessingJobId(jobId)
      setProcessingStatus('🎨 Phase 1: Enhancing images with Nano-Banana Pro...')
      setShowCreateForm(false)

      // Start Phase 1: Enhancement
      const processRes = await fetch('/api/generate/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: jobId }),
      })

      if (!processRes.ok) {
        const errorData = await processRes.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to start processing')
      }

      const processData = await processRes.json()
      
      if (processData.status === 'review_pending') {
        // Phase 1 complete - show review UI
        setProcessingStatus('')
        setProcessingJobId(null)
        setEnhancedImages(processData.enhancedImages || [])
        setReviewMode(true)
        alert('✅ รูปทั้งหมดถูกปรับปรุงแล้ว! กรุณาตรวจสอบและอนุมัติรูป')
      } else if (processData.error) {
        throw new Error(processData.error)
      } else {
        throw new Error('Unexpected response from processing API')
      }

      // Refresh dashboard
      fetchDashboardData()
      
    } catch (error) {
      console.error('Error creating job:', error)
      alert('Failed to create job: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setProcessingJobId(null)
      setProcessingStatus('')
      setCurrentJobId(null)
    } finally {
      setCreating(false)
    }
  }

  // NEW: Approve image
  async function handleApproveImage(index: number) {
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
        alert('✅ ทุกรูปได้รับการอนุมัติแล้ว! คุณสามารถสร้าง Template ได้')
      }
    } catch (error) {
      console.error('Approve error:', error)
      alert('Failed to approve image: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  // NEW: Regenerate image
  async function handleRegenerateImage(index: number) {
    if (!currentJobId) return

    setRegeneratingIndex(index)

    try {
      const res = await fetch('/api/generate/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: currentJobId,
          imageIndex: index,
          action: 'regenerate',
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to regenerate image')
      }

      const data = await res.json()
      
      if (!data.newUrl) {
        throw new Error('No new URL in response')
      }
      
      // Update local state with new URL
      const updated = [...enhancedImages]
      updated[index].url = data.newUrl
      updated[index].status = 'pending'
      setEnhancedImages(updated)

      alert('✅ รูปถูกสร้างใหม่แล้ว! กรุณาตรวจสอบอีกครั้ง')
    } catch (error) {
      console.error('Regenerate error:', error)
      alert('Failed to regenerate image: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setRegeneratingIndex(null)
    }
  }

  // NEW: Finalize template
  async function handleFinalizeTemplate() {
    if (!currentJobId) return

    const allApproved = enhancedImages.every(img => img.status === 'approved')
    if (!allApproved) {
      alert('⚠️ กรุณาอนุมัติรูปทั้งหมดก่อนสร้าง Template')
      return
    }

    setProcessingJobId(currentJobId)
    setProcessingStatus('🎨 กำลังสร้าง Template...')

    try {
      const res = await fetch('/api/generate/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJobId }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to finalize template')
      }

      const data = await res.json()
      
      if (!data.finalImageUrl) {
        throw new Error('No final image URL in response')
      }
      
      setFinalImageUrl(data.finalImageUrl)
      setReviewMode(false)
      setProcessingStatus('')
      setProcessingJobId(null)
      
      alert('🎉 Template สร้างเสร็จแล้ว!')
      fetchDashboardData()

    } catch (error) {
      console.error('Finalize error:', error)
      alert('Failed to create template')
      setProcessingStatus('')
      setProcessingJobId(null)
    }
  }

  // NEW: Reset workflow
  function handleResetWorkflow() {
    setReviewMode(false)
    setCurrentJobId(null)
    setEnhancedImages([])
    setFinalImageUrl(null)
    setShowCreateForm(true)
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

        {/* Create Job Form */}
        {showCreateForm && (
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
                    setSelectedSheetRow(null)
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

              {/* Select from Google Sheets */}
              {sheetData.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    เลือกสินค้าจาก Google Sheets
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
                    onChange={(e) => setSelectedSheetRow(sheetData[parseInt(e.target.value)])}
                  >
                    <option value="">-- เลือกสินค้า --</option>
                    {sheetData.map((row, index) => (
                      <option key={index} value={index}>
                        {row['Product Name'] || `Row ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Show selected sheet row as table with all columns */}
              {selectedSheetRow && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border-2 border-blue-200">
                  <h3 className="font-bold text-lg mb-4 text-blue-900">📋 ข้อมูลที่เลือกจาก Google Sheet:</h3>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white rounded-lg shadow-sm">
                      <thead className="bg-blue-600 text-white">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-sm">คอลัมน์</th>
                          <th className="px-4 py-3 text-left font-semibold text-sm">ข้อมูล</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {Object.entries(selectedSheetRow).map(([key, value], index) => (
                          <tr key={key} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-4 py-3 text-sm font-medium text-gray-700 whitespace-nowrap">
                              {key}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {value?.toString() || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* NEW: Template Configuration */}
              {selectedImages.length > 0 && (
                <div className="space-y-6 bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-xl border-2 border-indigo-200">
                  <h3 className="text-xl font-bold text-indigo-900 mb-4">⚙️ Template Configuration</h3>
                  
                  {/* Template Type Selector */}
                  <TemplateTypeSelector
                    value={templateType}
                    onChange={setTemplateType}
                    maxImages={selectedImages.length}
                  />

                  {/* Style Selector */}
                  <StyleSelector
                    value={templateStyle}
                    onChange={setTemplateStyle}
                    mode="ai"
                  />
                </div>
              )}

              {/* Google Drive Images */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  รูปอ้างอิงจาก Google Drive
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="ID โฟลเดอร์ (ไม่บังคับ - ว่างไว้เพื่อโหลดรูปทั้งหมด)"
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
                  />
                  <button
                    type="button"
                    onClick={loadDriveImages}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    📂 {driveFolderId ? 'โหลดรูปจากโฟลเดอร์' : 'โหลดรูปทั้งหมด'}
                  </button>
                </div>

                {/* Image Gallery */}
                {driveImages.length > 0 && (
                  <div className="mt-6 bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">รูปอ้างอิง</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          คลิกรูปเพื่อเลือก/ยกเลิกสำหรับวิเคราะห์ด้วย AI
                        </p>
                      </div>
                      <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-semibold">
                        {selectedImages.length} เลือกแล้ว
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {driveImages.filter(img => img && img.id && img.url).map((img) => {
                        const isSelected = selectedImages.find(i => i && i.id === img.id)
                        return (
                          <div
                            key={img.id}
                            onClick={() => toggleImageSelection(img)}
                            className={`group relative cursor-pointer rounded-xl overflow-hidden transition-all duration-300 ${
                              isSelected
                                ? 'ring-4 ring-blue-500 shadow-xl scale-[1.02]'
                                : 'ring-2 ring-gray-300 hover:ring-gray-400 hover:shadow-lg'
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
                                : 'bg-black/0 group-hover:bg-black/10'
                            }`} />
                            {/* Checkmark */}
                            {isSelected && (
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
                  </div>
                )}
              </div>

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
                  disabled={creating || selectedImages.length === 0 || !selectedSheetRow}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
                >
                  {creating ? '🎨 กำลังสร้าง...' : '✨ เริ่มสร้าง Template'}
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
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">📸 Review Enhanced Images</h2>
                <p className="text-gray-600 mt-1">
                  ตรวจสอบรูปที่ปรับปรุงแล้ว - อนุมัติหรือสร้างใหม่ตามต้องการ
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">
                  อนุมัติแล้ว: <span className="font-bold text-green-600">
                    {enhancedImages.filter(img => img.status === 'approved').length} / {enhancedImages.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enhancedImages.map((img, index) => (
                <div key={index} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 border-2 border-gray-200">
                  <div className="mb-3">
                    <h3 className="font-semibold text-gray-900">รูปที่ {index + 1}</h3>
                    <div className={`inline-block px-2 py-1 rounded text-xs font-medium mt-1 ${
                      img.status === 'approved' ? 'bg-green-100 text-green-700' :
                      img.status === 'regenerating' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {img.status === 'approved' ? '✅ อนุมัติแล้ว' :
                       img.status === 'regenerating' ? '🔄 กำลังสร้างใหม่...' :
                       '⏳ รอการตรวจสอบ'}
                    </div>
                  </div>

                  {/* Enhanced Image */}
                  <div className="relative aspect-[4/3] rounded-lg overflow-hidden mb-3 border-2 border-gray-300">
                    <Image
                      src={img.url}
                      alt={`Enhanced ${index + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {img.status !== 'approved' && (
                      <button
                        onClick={() => handleApproveImage(index)}
                        disabled={regeneratingIndex === index}
                        className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-medium text-sm disabled:bg-gray-400"
                      >
                        ✅ อนุมัติ
                      </button>
                    )}
                    <button
                      onClick={() => handleRegenerateImage(index)}
                      disabled={regeneratingIndex === index}
                      className="flex-1 bg-amber-600 text-white py-2 rounded-lg hover:bg-amber-700 font-medium text-sm disabled:bg-gray-400"
                    >
                      {regeneratingIndex === index ? '⏳ กำลังสร้าง...' : '🔄 สร้างใหม่'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Finalize Button */}
            <div className="mt-6 pt-6 border-t-2 border-gray-200">
              <div className="flex items-center justify-between">
                <button
                  onClick={handleResetWorkflow}
                  className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 font-semibold"
                >
                  ← เริ่มใหม่
                </button>
                <button
                  onClick={handleFinalizeTemplate}
                  disabled={!enhancedImages.every(img => img.status === 'approved')}
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-3 rounded-lg hover:from-purple-700 hover:to-indigo-700 font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed"
                >
                  {enhancedImages.every(img => img.status === 'approved') 
                    ? '🎨 สร้าง Template (Phase 3)' 
                    : '⚠️ กรุณาอนุมัติรูปทั้งหมดก่อน'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* NEW: Final Result Section */}
        {finalImageUrl && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-lg p-6 mb-8 border-2 border-green-300">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-green-900">🎉 Template สร้างเสร็จแล้ว!</h2>
                <p className="text-green-700 mt-1">
                  Type: {templateType} | Style: {templateStyle}
                </p>
              </div>
              <button
                onClick={handleResetWorkflow}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
              >
                ➕ สร้างใหม่
              </button>
            </div>

            <div className="relative w-full max-w-4xl mx-auto rounded-xl overflow-hidden shadow-2xl border-4 border-green-400">
              <Image
                src={finalImageUrl}
                alt="Final Template"
                width={1200}
                height={630}
                className="w-full h-auto"
                unoptimized
              />
            </div>

            <div className="mt-6 flex gap-4 justify-center">
              <button
                onClick={() => downloadImage(finalImageUrl, `template-${Date.now()}.png`)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
              >
                💾 ดาวน์โหลด
              </button>
              <button
                onClick={() => window.open(finalImageUrl, '_blank')}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-semibold"
              >
                🔍 เปิดในแท็บใหม่
              </button>
            </div>
          </div>
        )}

        {/* View Generated Images Modal */}
        {viewingJob && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-2xl font-bold">{viewingJob.productName}</h2>
                    <p className="text-gray-600 mt-1">ภาพที่สร้างแล้ว</p>
                  </div>
                  <button
                    onClick={() => setViewingJob(null)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>

                {/* Prompt Display */}
                {viewingJob.generatedPrompt && (
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <h3 className="font-semibold mb-2">Prompt ที่สร้าง:</h3>
                    <p className="text-sm text-gray-700">{viewingJob.generatedPrompt}</p>
                  </div>
                )}

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
                {viewingJob.generatedImages?.[selectedPlatform] ? (
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
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      ดาวน์โหลด {IMAGE_SIZES[selectedPlatform].label} (
                      {IMAGE_SIZES[selectedPlatform].width}×{IMAGE_SIZES[selectedPlatform].height}
                      )
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    ไม่มีภาพสำหรับแพลตฟอร์มนี้
                  </div>
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
            <h2 className="text-xl font-semibold text-gray-900">งานล่าสุด</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ชื่อสินค้า
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
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
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      ไม่พบงาน สร้างงานแรกของคุณ!
                    </td>
                  </tr>
                ) : (
                  recentJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{job.productName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(job.status)}`}
                        >
                          {job.status}
                        </span>
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
                        {(job.status === 'completed' ||
                          job.status === 'approved' ||
                          job.status === 'rejected') &&
                          job.generatedImages && (
                            <button
                              onClick={() => setViewingJob(job)}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
