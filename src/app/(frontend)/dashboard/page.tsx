/**
 * Dashboard Page - Simplified (Webhook Only)
 * No polling - webhook updates DB automatically
 */

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useJobRefresh } from './hooks/useJobRefresh'
import { ProcessingBanner } from './components/ProcessingBanner'
import { JobCard } from './components/JobCard'

// ... (keep existing interfaces from original file)
interface CurrentUser {
  id: string
  name: string
  email: string
}

interface Job {
  id: string
  productName: string
  jobType?: string
  status: string
  createdAt: string
  updatedAt?: string
  contentTopic?: string
  outputSize?: string
  templateUrl?: string
  selectedTemplateUrl?: string
  templateGeneration?: {
    predictionId?: string
    upscalePredictionId?: string
    status?: string
    url?: string
  }
  enhancedImageUrls?: Array<{
    url?: string
    status?: string
    [key: string]: any
  }>
  createdBy?: {
    id: string
    name: string
    email: string
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [processingStatus, setProcessingStatus] = useState('')
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [enhancedImages, setEnhancedImages] = useState<any[]>([])
  const [generatedTemplateUrl, setGeneratedTemplateUrl] = useState<string>('')
  const [reviewMode, setReviewMode] = useState(false)

  // Webhook-based refresh hook
  const { refreshJob } = useJobRefresh({
    onStatusUpdate: (statusData) => {
      // Update images if available
      if (statusData.images) {
        setEnhancedImages(statusData.images)
      }
      
      // Update template URL
      if (statusData.templateUrl) {
        setGeneratedTemplateUrl(statusData.templateUrl)
      }
      
      // Update status message
      if (statusData.status === 'enhancing' || statusData.status === 'processing') {
        const summary = statusData.summary
        setProcessingStatus(
          `⏳ กำลังประมวลผล... (${summary?.completed || 0}/${summary?.total || 0})`
        )
      }
    },
    onComplete: (jobId, statusData) => {
      setProcessingStatus('✅ สำเร็จ!')
      setCurrentJobId(jobId)
      setReviewMode(true)
      
      // Auto-dismiss after 3s
      setTimeout(() => {
        setProcessingStatus('')
      }, 3000)
      
      // Refresh dashboard
      fetchDashboardData()
    },
    onError: (error) => {
      setProcessingStatus(`❌ ${error}`)
    },
  })

  // Check authentication
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

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/jobs?limit=20')
      
      // ✅ Handle rate limit / server busy
      if (res.status === 503 || res.status === 429) {
        console.warn('⚠️ Server busy, will retry...')
        return // Skip this refresh, wait for next interval
      }
      
      if (!res.ok) throw new Error('Failed to fetch jobs')
      
      const data = await res.json()
      setJobs(data.jobs || [])
      
      // Check if coming from job creation
      const savedJobId = localStorage.getItem('processingJobId')
      if (savedJobId) {
        localStorage.removeItem('processingJobId')
        localStorage.removeItem('fromCustomPrompt')
        localStorage.removeItem('fromTextToImage')
        
        // Show initial status
        setProcessingStatus('⏳ กำลังเริ่มต้น...')
        setCurrentJobId(savedJobId)
        
        // Refresh after short delay to allow webhook to update
        setTimeout(() => {
          refreshJob(savedJobId)
        }, 2000)
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error)
    } finally {
      setLoading(false)
    }
  }, [refreshJob])

  useEffect(() => {
    if (currentUser) {
      fetchDashboardData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])  // ✅ Only re-run when currentUser changes

  // ✅ Auto-refresh สำหรับ jobs ที่กำลังประมวลผล
  // ⚠️ ปิดไว้เพื่อประหยัด DB - ให้ user กด refresh เอง
  /*
  useEffect(() => {
    if (!currentUser || jobs.length === 0) return

    // หา jobs ที่ยังไม่เสร็จ
    const processingJobs = jobs.filter(job => 
      job.status === 'processing' || 
      job.status === 'enhancing' || 
      job.status === 'generating_template'
    )

    if (processingJobs.length === 0) return

    console.log(`🔄 Auto-refresh: ${processingJobs.length} jobs in progress`)

    // ✅ Refresh ทุก 15 วินาที (balance ระหว่างความเร็วกับประหยัด DB)
    // 6 users × 15s = 4 queries/min/user = รวม 24 queries/min
    const interval = setInterval(() => {
      fetchDashboardData()
    }, 15000)

    return () => clearInterval(interval)
  }, [currentUser, jobs, fetchDashboardData])
  */

  // Logout
  async function handleLogout() {
    try {
      await fetch('/api/users/logout', { method: 'POST' })
      router.push('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  // View job details
  function handleViewJob(jobId: string) {
    refreshJob(jobId).then((statusData) => {
      if (statusData && statusData.images) {
        setCurrentJobId(jobId)
        setEnhancedImages(statusData.images)
        setGeneratedTemplateUrl(statusData.templateUrl || '')
        setReviewMode(true)
      }
    })
  }

  // Delete job
  async function handleDeleteJob(jobId: string) {
    if (!confirm('ยืนยันการลบ?')) return
    
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      
      // Refresh dashboard
      fetchDashboardData()
    } catch (error) {
      console.error('Delete error:', error)
      alert('❌ ลบไม่สำเร็จ')
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    )
  }

  if (!currentUser) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Processing Status Banner */}
      <ProcessingBanner 
        status={processingStatus}
        onDismiss={() => setProcessingStatus('')}
      />

      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">
              Dashboard
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {currentUser.name}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Quick Actions */}
        <div className="mb-8 flex gap-4">
          <button
            onClick={() => router.push('/text-to-image')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            🎨 Text to Image
          </button>
          <button
            onClick={() => router.push('/custom-prompt')}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            ✏️ Custom Prompt
          </button>
          <button
            onClick={fetchDashboardData}
            className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            🔄 รีเฟรช
          </button>
        </div>

        {/* Jobs Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">กำลังโหลดงาน...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">ยังไม่มีงาน</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onRefresh={refreshJob}
                onView={handleViewJob}
                onDelete={handleDeleteJob}
              />
            ))}
          </div>
        )}

        {/* Review Mode Modal */}
        {reviewMode && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto">
              <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
                <h2 className="text-xl font-bold">ดูรูป</h2>
                <button
                  onClick={() => setReviewMode(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  ปิด
                </button>
              </div>
              
              <div className="p-6">
                {/* Template */}
                {generatedTemplateUrl && (
                  <div className="mb-6">
                    <h3 className="font-bold mb-2">Template</h3>
                    <img
                      src={generatedTemplateUrl}
                      alt="Template"
                      className="max-w-full h-auto rounded"
                    />
                  </div>
                )}
                
                {/* Images */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {enhancedImages
                    .sort((a: any, b: any) => (a.index || 0) - (b.index || 0))
                    .map((img, index) => (
                    <div key={img.index !== undefined ? `img-${img.index}` : index} className="border rounded p-2">
                      {img.url ? (
                        <img
                          src={img.url}
                          alt={`Image ${(img.index !== undefined ? img.index : index) + 1}`}
                          className="w-full h-auto rounded"
                        />
                      ) : (
                        <div className="bg-gray-200 aspect-square rounded flex items-center justify-center">
                          {img.status === 'pending' ? '⏳' : '❌'}
                        </div>
                      )}
                      <div className="text-xs text-gray-600 mt-1">
                        {img.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
