'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

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
    facebook?: { url: string; id: string }
    instagram_feed?: { url: string; id: string }
    instagram_story?: { url: string; id: string }
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
  facebook: { label: 'Facebook Post', width: 1200, height: 630 },
  instagram_feed: { label: 'Instagram Feed', width: 1080, height: 1080 },
  instagram_story: { label: 'Instagram Story', width: 1080, height: 1920 },
}

export default function DashboardPage() {
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
  const [userActivities, setUserActivities] = useState<UserActivity[]>([])

  // Create Job Form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [spreadsheets, setSpreadsheets] = useState<{ id: string; name: string }[]>([])
  const [selectedSheetId, setSelectedSheetId] = useState<string>('')
  const [sheetData, setSheetData] = useState<SheetData[]>([])
  const [selectedSheetRow, setSelectedSheetRow] = useState<SheetData | null>(null)
  const [driveFolderId, setDriveFolderId] = useState<string>('')
  const [driveImages, setDriveImages] = useState<DriveImage[]>([])
  const [selectedImages, setSelectedImages] = useState<DriveImage[]>([])
  const [mood, setMood] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['facebook', 'instagram_feed'])
  const [creating, setCreating] = useState(false)

  // View Generated Images
  const [viewingJob, setViewingJob] = useState<Job | null>(null)
  const [selectedPlatform, setSelectedPlatform] = useState<keyof typeof IMAGE_SIZES>('facebook')

  // Processing status
  const [processingJobId, setProcessingJobId] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string>('')

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
    fetchSpreadsheets()
  }, [])

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
        setDriveImages(data.images || [])
      } else {
        alert('Failed to load images')
      }
    } catch (error) {
      console.error('Error loading drive images:', error)
      alert('Error loading images')
    }
  }

  function toggleImageSelection(image: DriveImage) {
    setSelectedImages(prev => {
      const exists = prev.find(img => img.id === image.id)
      if (exists) {
        return prev.filter(img => img.id !== image.id)
      } else {
        return [...prev, image]
      }
    })
  }

  async function createJob() {
    if (!selectedSheetRow) {
      alert('Please select product data from sheet')
      return
    }

    setCreating(true)

    try {
      // Create job
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selectedSheetRow['Product Name'] || 'Untitled',
          productDescription: selectedSheetRow['Product Description'] || selectedSheetRow['Description'] || '',
          mood,
          targetPlatforms: platforms,
          referenceImageIds: selectedImages.map((img) => ({ imageId: img.id })),
          referenceImageUrls: selectedImages.map((img) => ({ url: img.url })),
          status: 'pending',
        }),
      })

      if (!jobRes.ok) {
        throw new Error('Failed to create job')
      }

      const job = await jobRes.json()
      console.log('Job created:', job)

      // Set processing state
      setProcessingJobId(job.id)
      setProcessingStatus('🔄 Creating job...')
      setShowCreateForm(false)

      // Start processing in background
      setProcessingStatus('🤖 Generating prompt with GPT-4...')
      
      fetch('/api/generate/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }),
      }).catch(err => console.error('Process error:', err))

      // Refresh dashboard immediately to show new job
      fetchDashboardData()
      
      // Poll for updates every 3 seconds
      let pollCount = 0
      const maxPolls = 100 // 5 minutes max
      
      const pollInterval = setInterval(async () => {
        pollCount++
        
        const jobsRes = await fetch('/api/jobs')
        const data = await jobsRes.json()
        const currentJob = data.jobs.find((j: Job) => j.id === job.id)
        
        if (currentJob) {
          // Update status message
          if (currentJob.status === 'processing') {
            if (currentJob.generatedPrompt && !currentJob.generatedImages) {
              setProcessingStatus('🎨 Generating image with DALL-E 3...')
            } else if (currentJob.generatedImages) {
              setProcessingStatus('📐 Resizing images for platforms...')
            } else {
              setProcessingStatus('🤖 Generating prompt with GPT-4...')
            }
          } else if (currentJob.status === 'completed') {
            clearInterval(pollInterval)
            setProcessingStatus('✅ Complete!')
            fetchDashboardData()
            
            // Auto-open the result
            setTimeout(() => {
              setViewingJob(currentJob)
              setProcessingJobId(null)
              setProcessingStatus('')
            }, 1000)
            
            return
          } else if (currentJob.status === 'failed') {
            clearInterval(pollInterval)
            setProcessingStatus('❌ Failed')
            fetchDashboardData()
            alert('Job failed: ' + (currentJob.errorMessage || 'Unknown error'))
            setProcessingJobId(null)
            setProcessingStatus('')
            return
          }
          
          // Update dashboard data
          fetchDashboardData()
        }
        
        // Stop after max polls
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval)
          setProcessingStatus('⏱️ Timeout - check job status')
          setProcessingJobId(null)
        }
      }, 3000)
      
    } catch (error) {
      console.error('Error creating job:', error)
      alert('Failed to create job: ' + (error instanceof Error ? error.message : 'Unknown error'))
      setProcessingJobId(null)
      setProcessingStatus('')
    } finally {
      setCreating(false)
    }
  }

  async function handleApproveReject(jobId: string, action: 'approve' | 'reject') {
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Image Generation Dashboard</h1>
            <p className="text-gray-600 mt-2">Create and manage AI-generated images</p>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
          >
            {showCreateForm ? 'Close' : '+ Create New Job'}
          </button>
        </div>

        {/* Processing Status Banner */}
        {processingJobId && processingStatus && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-8 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <div>
                  <h3 className="text-lg font-bold text-blue-900">Processing Job...</h3>
                  <p className="text-blue-700 text-sm mt-1">{processingStatus}</p>
                  <p className="text-blue-600 text-xs mt-1">This may take 30-60 seconds. Please wait...</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setProcessingJobId(null)
                  setProcessingStatus('')
                }}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                Hide
              </button>
            </div>
          </div>
        )}

        {/* Create Job Form */}
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Create New Image Generation Job</h2>

            <div className="space-y-4">
              {/* Select Google Sheet */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Google Sheet
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
                  <option value="">-- Select Sheet --</option>
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
                  onClick={fetchSheetData}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                  Load Products from Sheet
                </button>
              )}

              {/* Select from Google Sheets */}
              {sheetData.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Product from Google Sheets
                  </label>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
                    onChange={(e) => setSelectedSheetRow(sheetData[parseInt(e.target.value)])}
                  >
                    <option value="">-- Select Product --</option>
                    {sheetData.map((row, index) => (
                      <option key={index} value={index}>
                        {row['Product Name'] || `Row ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Show selected product info */}
              {selectedSheetRow && (
                <div className="bg-gray-50 p-4 rounded">
                  <h3 className="font-semibold mb-2 text-gray-900">Selected Product:</h3>
                  <p className="text-gray-900">
                    <strong>Name:</strong> {selectedSheetRow['Product Name']}
                  </p>
                  <p className="text-gray-900">
                    <strong>Description:</strong> {selectedSheetRow['Product Description'] || selectedSheetRow['Description']}
                  </p>
                </div>
              )}

              {/* Google Drive Images */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reference Images from Google Drive
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Folder ID (optional - leave empty to load all images)"
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
                  />
                  <button
                    onClick={loadDriveImages}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                  >
                    📂 {driveFolderId ? 'Load Images from Folder' : 'Load All Images'}
                  </button>
                </div>

                {/* Image Gallery */}
                {driveImages.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-600 mb-2">
                      Select reference images (click to select/deselect):
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {driveImages.map((img) => (
                        <div
                          key={img.id}
                          onClick={() => toggleImageSelection(img)}
                          className={`relative cursor-pointer border-2 rounded-lg overflow-hidden ${
                            selectedImages.find(i => i.id === img.id)
                              ? 'border-blue-500'
                              : 'border-gray-200'
                          }`}
                        >
                          <Image
                            src={img.thumbnailUrl}
                            alt={img.name}
                            width={100}
                            height={100}
                            className="w-full h-24 object-cover"
                          />
                          {selectedImages.find(i => i.id === img.id) && (
                            <div className="absolute top-1 right-1 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                              ✓
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Selected: {selectedImages.length} image(s)
                    </p>
                  </div>
                )}
              </div>

              {/* Mood */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mood / Style
                </label>
                <input
                  type="text"
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
                  placeholder="e.g., Professional, Modern, Vibrant"
                />
              </div>

              {/* Platforms */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Platforms (Select image sizes to generate)
                </label>
                <div className="space-y-2">
                  {Object.entries(IMAGE_SIZES).map(([key, size]) => (
                    <label key={key} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={platforms.includes(key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setPlatforms([...platforms, key])
                          } else {
                            setPlatforms(platforms.filter((p) => p !== key))
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="font-medium">{size.label}</span>
                      <span className="text-gray-500 text-sm ml-2">
                        ({size.width}x{size.height}px)
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={createJob}
                disabled={creating || !selectedSheetRow}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400"
              >
                {creating ? 'Creating...' : 'Generate Images'}
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
                    <p className="text-gray-600 mt-1">Generated Images</p>
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
                    <h3 className="font-semibold mb-2">Generated Prompt:</h3>
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
                      />
                    </div>

                    {/* Download Button */}
                    <button
                      onClick={() =>
                        downloadImage(
                          viewingJob.generatedImages![selectedPlatform]!.url,
                          `${viewingJob.productName}_${selectedPlatform}_${IMAGE_SIZES[selectedPlatform].width}x${IMAGE_SIZES[selectedPlatform].height}.jpg`,
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
                      Download {IMAGE_SIZES[selectedPlatform].label} (
                      {IMAGE_SIZES[selectedPlatform].width}×{IMAGE_SIZES[selectedPlatform].height}
                      )
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No image generated for this platform
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Total Jobs</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Pending</div>
            <div className="text-3xl font-bold text-gray-600 mt-2">{stats.pending}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Processing</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">{stats.processing}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Completed</div>
            <div className="text-3xl font-bold text-green-600 mt-2">{stats.completed}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Approved</div>
            <div className="text-3xl font-bold text-emerald-600 mt-2">{stats.approved}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Rejected</div>
            <div className="text-3xl font-bold text-orange-600 mt-2">{stats.rejected}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Failed</div>
            <div className="text-3xl font-bold text-red-600 mt-2">{stats.failed}</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600">Success Rate</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%
            </div>
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Recent Jobs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      No jobs found. Create your first job!
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
                              🖼️ View
                            </button>
                          )}
                        {job.status === 'completed' && (
                          <>
                            <button
                              onClick={() => handleApproveReject(job.id, 'approve')}
                              className="text-green-600 hover:text-green-900"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleApproveReject(job.id, 'reject')}
                              className="text-red-600 hover:text-red-900"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={async () => {
                            if (confirm('Delete this job?')) {
                              await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
                              fetchDashboardData()
                            }
                          }}
                          className="text-gray-600 hover:text-red-600"
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Activity */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">User Activity History</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jobs Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jobs Approved
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jobs Rejected
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {userActivities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      No user activity found
                    </td>
                  </tr>
                ) : (
                  userActivities.map((activity) => (
                    <tr key={activity.userId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{activity.userName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{activity.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{activity.jobsCreated}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-green-600 font-medium">
                          {activity.jobsApproved}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-orange-600 font-medium">
                          {activity.jobsRejected}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {new Date(activity.lastActivity).toLocaleString()}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Admin Link */}
        <div className="mt-8 text-center">
          <Link href="/admin" className="text-gray-600 hover:text-gray-900">
            → Go to Admin Panel (Manage Users & View Logs)
          </Link>
        </div>
      </div>
    </div>
  )
}
