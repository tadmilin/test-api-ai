/**
 * JobCard Component
 * Display individual job in dashboard
 */

import { useState } from 'react'
import { normalizeImageUrl } from '@/utilities/googleDriveUrl'

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
  enhancedImageUrls?: Array<{
    url?: string
    status?: string
  }>
  createdBy?: {
    name: string
  }
}

interface JobCardProps {
  job: Job
  onRefresh: (jobId: string) => void
  onView: (jobId: string) => void
  onDelete: (jobId: string) => void
}

export function JobCard({ job, onRefresh, onView, onDelete }: JobCardProps) {
  const [imageError, setImageError] = useState(false)
  
  // ✅ แสดง template ก่อน ถ้าไม่มีค่อยแสดง enhanced images
  const templateUrl = job.templateUrl
  const completedImages = (job.enhancedImageUrls || []).filter(
    (img) => img.status === 'completed' && img.url && 
    (img.url.includes('cloudinary.com') || img.url.includes('blob.vercel-storage.com'))
  )
  
  // ✅ ใช้ template ก่อน ถ้าไม่มีใช้ enhanced image
  const firstImageUrl = templateUrl || completedImages[0]?.url
  const normalizedUrl = firstImageUrl ? normalizeImageUrl(firstImageUrl) : null
  
  // ✅ Validate URL before rendering Image component
  const hasValidImage = normalizedUrl && 
    !imageError && 
    (normalizedUrl.includes('cloudinary.com') || normalizedUrl.includes('blob.vercel-storage.com'))
  
  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    processing: 'bg-blue-100 text-blue-800',
    enhancing: 'bg-purple-100 text-purple-800',
    generating_template: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  }
  
  const statusLabels: Record<string, string> = {
    pending: 'รอดำเนินการ',
    processing: 'กำลังสร้าง',
    enhancing: 'กำลังปรับปรุง',
    generating_template: 'กำลังสร้าง Template',
    completed: 'เสร็จสิ้น',
    failed: 'ล้มเหลว',
  }
  
  const statusColor = statusColors[job.status] || 'bg-gray-100 text-gray-800'
  const statusLabel = statusLabels[job.status] || job.status
  
  const isProcessing = job.status === 'processing' || job.status === 'enhancing' || job.status === 'generating_template'
  
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      {/* Preview Image */}
      {hasValidImage && !imageError ? (
        <div className="relative w-full h-40 mb-3 bg-gray-100 rounded overflow-hidden">
          <img
            src={normalizedUrl}
            alt={job.productName}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        </div>
      ) : (
        <div className="w-full h-40 mb-3 bg-gray-200 rounded flex items-center justify-center text-gray-400">
          {isProcessing ? '⏳ กำลังสร้าง...' : 'ไม่มีภาพ'}
        </div>
      )}
      
      {/* Job Info */}
      <h3 className="font-medium text-sm mb-2 line-clamp-2">
        {job.productName}
      </h3>
      
      {/* Job Type Badge */}
      {job.jobType === 'template-merge' && (
        <div className="mb-2">
          <span className="text-xs px-2 py-0.5 rounded bg-pink-100 text-pink-800">
            📄 มี Template
          </span>
        </div>
      )}
      
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs px-2 py-1 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
        {job.outputSize && (
          <span className="text-xs text-gray-600">
            {job.outputSize}
          </span>
        )}
      </div>
      
      <div className="text-xs text-gray-600 mb-3">
        <div>{completedImages.length} รูป</div>
        {job.createdBy && (
          <div>โดย: {job.createdBy.name}</div>
        )}
        <div>{new Date(job.createdAt).toLocaleDateString('th-TH')}</div>
      </div>
      
      {/* Actions */}
      <div className="flex gap-2">
        {isProcessing && (
          <button
            onClick={() => onRefresh(job.id)}
            className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            🔄 รีเฟรช
          </button>
        )}
        {job.status === 'completed' && (
          <button
            onClick={() => onView(job.id)}
            className="flex-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            👁️ ดูรูป
          </button>
        )}
        <button
          onClick={() => onDelete(job.id)}
          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
        >
          🗑️
        </button>
      </div>
    </div>
  )
}
