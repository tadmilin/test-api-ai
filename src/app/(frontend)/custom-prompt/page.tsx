'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FolderTree, type TreeFolder } from '@/components/FolderTree'

interface CurrentUser {
  id: string
  name: string
  email: string
  role: string
}

interface DriveImage {
  id: string
  name: string
  thumbnailUrl: string
  url: string
}

export default function CustomPromptPage() {
  const router = useRouter()
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  
  // Form state
  const [driveFolders, setDriveFolders] = useState<Array<{ driveId: string; driveName: string; folders: TreeFolder[] }>>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')
  const [driveFolderId, setDriveFolderId] = useState<string>('')
  const [driveImages, setDriveImages] = useState<DriveImage[]>([])
  const [selectedImagesMap, setSelectedImagesMap] = useState<Map<string, DriveImage>>(new Map())
  const [customPrompt, setCustomPrompt] = useState<string>('')
  const [outputSize, setOutputSize] = useState<string>('1:1-2K')
  const [creating, setCreating] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [processingError, setProcessingError] = useState<string>('')
  
  // Template state
  const [enableTemplate, setEnableTemplate] = useState(false)
  const [templateFolderId, setTemplateFolderId] = useState<string>('')
  const [templateImages, setTemplateImages] = useState<DriveImage[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')

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
      fetchDriveFolders()
    }
  }, [currentUser, fetchDriveFolders])

  async function fetchDriveFolders() {
    try {
      const res = await fetch('/api/drive/list-folders')
      if (res.ok) {
        const data = await res.json()
        console.log('📁 Drive folders:', data)
        setDriveFolders(data.drives || [])
      }
    } catch (error) {
      console.error('Error fetching Drive folders:', error)
    }
  }

  async function handleFolderSelect(folderId: string) {
    setSelectedFolderId(folderId)
    setDriveImages([])
  }

  async function loadDriveImages() {
    if (!selectedFolderId) {
      alert('กรุณาเลือกโฟลเดอร์ก่อน')
      return
    }

    try {
      const res = await fetch('/api/drive/list-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: selectedFolderId }),
      })

      if (res.ok) {
        const data = await res.json()
        // Use images array from response
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
      console.error('Error fetching images:', error)
      alert('Error loading images')
    }
  }

  function _handleDriveFolderChange(driveId: string) {
    setDriveFolderId(driveId)
    setSelectedFolderId('')
    setDriveImages([])
  }

  function toggleImageSelection(image: DriveImage) {
    setSelectedImagesMap(prev => {
      const newMap = new Map(prev)
      if (newMap.has(image.id)) {
        newMap.delete(image.id)
      } else {
        newMap.set(image.id, image)
      }
      return newMap
    })
  }

  async function loadTemplateImages() {
    if (!templateFolderId) {
      alert('กรุณาเลือกโฟลเดอร์ Template ก่อน')
      return
    }

    try {
      const res = await fetch('/api/drive/list-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: templateFolderId }),
      })

      if (res.ok) {
        const data = await res.json()
        const validImages = (data.images || []).filter((img: DriveImage) => 
          img && img.id && img.url && img.thumbnailUrl
        )
        setTemplateImages(validImages)
        console.log(`✅ Loaded ${validImages.length} templates`)
      } else {
        alert('Failed to load templates')
      }
    } catch (error) {
      console.error('Error loading templates:', error)
      alert('Error loading templates')
    }
  }

  async function handleCreate() {
    if (selectedImagesMap.size === 0) {
      alert('กรุณาเลือกรูปอย่างน้อย 1 รูป')
      return
    }

    if (!customPrompt.trim()) {
      alert('กรุณากรอก Prompt')
      return
    }

    if (enableTemplate && !selectedTemplate) {
      alert('กรุณาเลือก Template')
      return
    }

    setCreating(true)
    setProcessingError('')
    setProcessingStatus('กำลังสร้างงาน...')

    try {
      const selectedImageUrls = Array.from(selectedImagesMap.values()).map(img => ({ url: img.url }))

      // Create job
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: 'Custom Prompt Job',
          productDescription: customPrompt.trim(),
          // contentTopic: ไม่ระบุ - เพราะ upscale จะทำที่ template แทน
          referenceImageUrls: selectedImageUrls,
          customPrompt: customPrompt.trim(),
          templateType: 'custom',
          status: 'pending',
          outputSize: outputSize,
          templateUrl: enableTemplate ? selectedTemplate : undefined,
        }),
      })

      if (!jobRes.ok) {
        const errorData = await jobRes.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to create job')
      }

      const response = await jobRes.json()
      const jobData = response.doc || response
      const jobId = jobData.id

      setProcessingStatus(`เริ่มประมวลผล ${selectedImagesMap.size} รูป...`)

      // Start processing
      const processRes = await fetch('/api/generate/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })

      if (!processRes.ok) {
        const errorData = await processRes.json().catch(() => ({ error: 'Unknown error' }))
        const errorMsg = errorData.error || 'Processing failed'
        
        if (errorMsg.includes('402') || errorMsg.includes('Payment Required') || errorMsg.includes('Insufficient credit')) {
          setProcessingError('⚠️ Replicate หมดเครดิต - กรุณาเติมเครดิตที่ https://replicate.com/account/billing')
        } else {
          setProcessingError(`❌ Server Error: ${errorMsg}`)
        }
        
        setProcessingStatus('')
        throw new Error(errorMsg)
      }

      // ✅ Redirect to dashboard immediately (let dashboard handle polling & template)
      setProcessingStatus('✅ เริ่มประมวลผลสำเร็จ! กำลังเปลี่ยนหน้า...')
      
      // Store template info in localStorage for dashboard to pick up
      if (enableTemplate && selectedTemplate) {
        localStorage.setItem('pendingTemplateUrl', selectedTemplate)
        localStorage.setItem('pendingTemplateJobId', jobId)
      }
      
      // Set flag and jobId for dashboard to auto-resume
      localStorage.setItem('fromCustomPrompt', 'true')
      localStorage.setItem('processingJobId', jobId)
      
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)

    } catch (error) {
      console.error('Error:', error)
      if (!processingError) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        if (errorMsg.includes('402') || errorMsg.includes('Payment Required') || errorMsg.includes('Insufficient credit')) {
          setProcessingError('⚠️ Replicate หมดเครดิต - กรุณาเติมเครดิตที่ https://replicate.com/account/billing')
        } else {
          setProcessingError(`❌ เกิดข้อผิดพลาด: ${errorMsg}`)
        }
      }
      setProcessingStatus('')
    } finally {
      setCreating(false)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">⚡ Custom Prompt Mode</h1>
              <p className="text-gray-600 mt-2">เขียน Prompt เอง ควบคุมเต็มที่</p>
            </div>
            <Link href="/dashboard">
              <button className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 font-semibold shadow-lg hover:shadow-xl transition-all">
                ← กลับหน้า Dashboard
              </button>
            </Link>
          </div>

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

          {/* Processing Status */}
          {processingStatus && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-8">
              <p className="text-blue-900 font-semibold">{processingStatus}</p>
            </div>
          )}

          {/* Form */}
          <div className="space-y-6">
            {/* 1. Google Drive Images */}
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
                        setDriveFolderId(drive.driveId)
                        handleFolderSelect(folderId)
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

                {/* Load Images Button */}
                {selectedFolderId && driveFolderId && (
                  <button
                    type="button"
                    onClick={loadDriveImages}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 w-full font-medium"
                  >
                    📂 โหลดรูปจากโฟลเดอร์
                  </button>
                )}
              </div>
            </div>

            {/* Image Gallery */}
            {driveImages.length > 0 && (
              <div className="mt-6 bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">2️⃣ เลือกรูปสำหรับ Custom Prompt</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      คลิกรูปเพื่อเลือก
                    </p>
                  </div>
                  <div className={`px-4 py-2 rounded-lg font-semibold ${
                    selectedImagesMap.size > 0
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedImagesMap.size} รูป
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {driveImages.map((img) => {
                    const isSelected = selectedImagesMap.has(img.id)
                    return (
                      <div
                        key={img.id}
                        onClick={() => toggleImageSelection(img)}
                        className={`group relative rounded-xl overflow-hidden transition-all duration-300 ${
                          isSelected
                            ? 'ring-4 ring-purple-500 shadow-xl scale-[1.02] cursor-pointer'
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
                            ? 'bg-purple-500/20' 
                            : 'bg-black/0 group-hover:bg-black/10'
                        }`} />
                        {/* Checkmark */}
                        {isSelected && (
                          <div className="absolute top-3 right-3 bg-purple-500 text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg animate-in zoom-in duration-200">
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

            {/* Selected Images Preview - แสดงรูปที่เลือกจากทุกโฟลเดอร์ */}
            {selectedImagesMap.size > 0 && (
              <div className="mt-6 bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl border-2 border-purple-300 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-purple-900 flex items-center gap-2">
                      <span className="text-2xl">✅</span>
                      <span>รูปที่เลือกแล้ว ({selectedImagesMap.size} รูป)</span>
                    </h3>
                    <p className="text-sm text-purple-700 mt-1">จากทุกโฟลเดอร์ที่เลือกมา</p>
                  </div>
                  <button
                    onClick={() => setSelectedImagesMap(new Map())}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-semibold transition-all border border-red-300"
                  >
                    🗑️ ล้างทั้งหมด
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {Array.from(selectedImagesMap.values()).map((img) => (
                    <div key={img.id} className="relative group">
                      <div className="aspect-square rounded-lg overflow-hidden border-2 border-purple-400 shadow-md">
                        <Image
                          src={img.thumbnailUrl}
                          alt={img.name}
                          width={200}
                          height={200}
                          className="object-cover w-full h-full"
                          unoptimized
                        />
                      </div>
                      <button
                        onClick={() => toggleImageSelection(img)}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg font-bold"
                      >
                        ✕
                      </button>
                      <p className="text-xs text-purple-800 mt-1 truncate font-medium">{img.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Custom Prompt */}
            {selectedImagesMap.size > 0 && (
              <div className="mt-6 bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl border-2 border-purple-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  3️⃣ เขียน Prompt (คำสั่งให้ AI ตกแต่งรูป)
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={6}
                  placeholder="เช่น: ทำให้รูปสว่างขึ้น เพิ่มความคมชัด และปรับสีให้สดใส..."
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-2">
                  💡 เคล็ดลับ: อธิบายให้ละเอียด ใช้ภาษาไทยหรืออังกฤษก็ได้ (ยาว {customPrompt.length} ตัวอักษร)
                </p>
              </div>
            )}

            {/* 3.5. Output Size Selection */}
            {selectedImagesMap.size > 0 && customPrompt.trim() && (
              <div className="mt-6 bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl border-2 border-green-200">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  📐 เลือกขนาดรูปที่ต้องการ
                </label>
                <select
                  value={outputSize}
                  onChange={(e) => setOutputSize(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 font-medium focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="1:1-2K">1:1 Square (2048×2048) - FB/IG Feed</option>
                  <option value="4:5-2K">4:5 Portrait (1080×1350) - FB/IG Feed</option>
                  <option value="9:16-2K">9:16 Vertical (1080×1920) - Story/TikTok</option>
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  💡 Nano Banana Pro: 1:1 จะถูก upscale เป็น 2048×2048 (ใช้เวลานานกว่า), ขนาดอื่น resize ตรง (เร็วกว่า)
                </p>
              </div>
            )}

            {/* 4. Template Selection (Optional) */}
            {selectedImagesMap.size > 0 && customPrompt.trim() && (
              <div className="mt-6 bg-gradient-to-br from-blue-50 to-cyan-50 p-6 rounded-xl border-2 border-blue-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-700">
                      4️⃣ สร้าง Template ด้วย? (ไม่บังคับ)
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableTemplate}
                        onChange={(e) => setEnableTemplate(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  {enableTemplate && (
                    <span className="text-xs text-blue-600 font-semibold">
                      🎨 โหมด Template เปิดอยู่
                    </span>
                  )}
                </div>
                
                {enableTemplate && (
                  <div className="mt-4 space-y-4">
                    {/* Template Folder Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        เลือกโฟลเดอร์ Template
                      </label>
                      {driveFolders.map((drive) => (
                        <div key={drive.driveId} className="mb-4">
                          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                            <span>🎨</span>
                            <span>{drive.driveName}</span>
                          </h3>
                          <FolderTree
                            folders={drive.folders}
                            onSelectFolder={(folderId) => {
                              setTemplateFolderId(folderId)
                              setTemplateImages([])
                              setSelectedTemplate('')
                            }}
                            selectedFolderId={templateFolderId}
                          />
                        </div>
                      ))}
                      
                      {templateFolderId && (
                        <button
                          type="button"
                          onClick={loadTemplateImages}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 w-full font-medium mt-2"
                        >
                          📂 โหลด Template จากโฟลเดอร์
                        </button>
                      )}
                    </div>

                    {/* Template Gallery */}
                    {templateImages.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-3">
                          เลือก Template (คลิกที่รูป)
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          {templateImages.map((img) => {
                            const isSelected = selectedTemplate === img.url
                            return (
                              <div
                                key={img.id}
                                onClick={() => setSelectedTemplate(img.url)}
                                className={`group relative rounded-lg overflow-hidden transition-all duration-300 cursor-pointer ${
                                  isSelected
                                    ? 'ring-4 ring-blue-500 shadow-xl scale-[1.05]'
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
                                {isSelected && (
                                  <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                                    <div className="bg-blue-500 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg">
                                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {selectedTemplate && (
                      <div className="mt-4 p-4 bg-blue-100 rounded-lg border border-blue-300">
                        <p className="text-sm text-blue-900 font-medium">
                          ✅ Template ถูกเลือกแล้ว - รูปที่ปรับปรุงจะถูกนำไปใส่ใน Template โดยอัตโนมัติ
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 5. Create Button */}
            {selectedImagesMap.size > 0 && customPrompt.trim() && (
              <div className="mt-6 bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl border-2 border-purple-200">
                <div className="pt-6 border-t border-purple-200">
                  <button
                    onClick={handleCreate}
                    disabled={creating || selectedImagesMap.size === 0 || !customPrompt.trim() || (enableTemplate && !selectedTemplate)}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-4 rounded-lg hover:from-purple-700 hover:to-blue-700 font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {creating ? (
                      <>
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        กำลังสร้าง...
                      </>
                    ) : (
                      <>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {enableTemplate 
                          ? `🎨 สร้างรูป + Template (${selectedImagesMap.size} รูป)`
                          : `✨ สร้างรูปด้วย Custom Prompt (${selectedImagesMap.size} รูป)`
                        }
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
