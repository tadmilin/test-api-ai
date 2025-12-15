'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FolderTree, type TreeFolder } from '@/components/FolderTree'
import { getGoogleDriveThumbnail, normalizeImageUrl, isGoogleDriveUrl } from '@/utilities/googleDriveUrl'

interface CurrentUser {
  id: string
  name: string
  email: string
  role: string
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

export default function CustomPromptPage() {
  const router = useRouter()
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  
  // Form state
  const [spreadsheets, setSpreadsheets] = useState<{ id: string; name: string }[]>([])
  const [selectedSheetId, setSelectedSheetId] = useState<string>('')
  const [sheetData, setSheetData] = useState<SheetData[]>([])
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0)
  const [driveFolders, setDriveFolders] = useState<Array<{ driveId: string; driveName: string; folders: TreeFolder[] }>>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string>('')
  const [driveFolderId, setDriveFolderId] = useState<string>('')
  const [driveImages, setDriveImages] = useState<DriveImage[]>([])
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [customPrompt, setCustomPrompt] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [processingError, setProcessingError] = useState<string>('')

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
      fetchSpreadsheets()
      fetchDriveFolders()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser])

  async function fetchSpreadsheets() {
    try {
      const res = await fetch('/api/sheets/list')
      if (res.ok) {
        const data = await res.json()
        console.log('📊 Spreadsheets:', data)
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
        console.log('📁 Drive folders:', data)
        setDriveFolders(data.drives || [])
      }
    } catch (error) {
      console.error('Error fetching Drive folders:', error)
    }
  }

  async function handleSheetSelect(sheetId: string) {
    setSelectedSheetId(sheetId)
    setSelectedRowIndex(0)
    setSheetData([])
  }

  async function loadSheetData() {
    if (!selectedSheetId) return
    
    try {
      const res = await fetch(`/api/sheets/${selectedSheetId}/data`)
      if (res.ok) {
        const data = await res.json()
        setSheetData(data.data || [])
        console.log('📊 Loaded', data.data?.length || 0, 'rows from sheet')
      }
    } catch (error) {
      console.error('Error fetching sheet data:', error)
    }
  }

  async function handleFolderSelect(folderId: string) {
    setSelectedFolderId(folderId)
    setDriveImages([])
    setSelectedImages(new Set())
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

  function handleDriveFolderChange(driveId: string) {
    setDriveFolderId(driveId)
    setSelectedFolderId('')
    setSelectedImages(new Set())
    setDriveImages([])
  }

  function toggleImageSelection(imageId: string) {
    setSelectedImages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(imageId)) {
        newSet.delete(imageId)
      } else {
        newSet.add(imageId)
      }
      return newSet
    })
  }

  async function handleCreate() {
    if (selectedImages.size === 0) {
      alert('กรุณาเลือกรูปอย่างน้อย 1 รูป')
      return
    }

    if (!customPrompt.trim()) {
      alert('กรุณากรอก Prompt')
      return
    }

    setCreating(true)
    setProcessingError('')
    setProcessingStatus('กำลังสร้างงาน...')

    try {
      const selectedRow = sheetData[selectedRowIndex] || {}
      const selectedImageUrls = driveImages
        .filter(img => selectedImages.has(img.id))
        .map(img => ({ url: img.url }))

      // Create job
      const jobRes = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: selectedRow['Product Name'] || 'Custom Prompt Job',
          productDescription: selectedRow['Product Description'] || selectedRow['Description'] || '',
          contentTopic: selectedRow['Content_Topic'] || '',
          postTitleHeadline: selectedRow['Post_Title_Headline'] || '',
          contentDescription: selectedRow['Content_Description'] || '',
          referenceImageUrls: selectedImageUrls,
          customPrompt: customPrompt.trim(),
          templateType: 'custom',
          status: 'pending',
        }),
      })

      if (!jobRes.ok) {
        const errorData = await jobRes.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to create job')
      }

      const response = await jobRes.json()
      const jobData = response.doc || response
      const jobId = jobData.id

      setProcessingStatus(`เริ่มประมวลผล ${selectedImages.size} รูป...`)

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

      setProcessingStatus('✅ เริ่มประมวลผลสำเร็จ! กำลังเปลี่ยนหน้า...')
      
      // Set flag for dashboard to auto-resume
      localStorage.setItem('fromCustomPrompt', 'true')
      
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

  const selectedRow = sheetData[selectedRowIndex] || {}

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
            {/* Debug Info */}
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-xs">
                <p>User: {currentUser?.email || 'Not logged in'}</p>
                <p>Sheets: {spreadsheets.length} | Drives: {driveFolders.length}</p>
              </div>
            )}
            
            {/* 1. Select Sheet */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                เลือกชีท Google
              </label>
              <select
                value={selectedSheetId}
                onChange={(e) => handleSheetSelect(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
              >
                <option value="">-- เลือกชีท --</option>
                {spreadsheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>{sheet.name}</option>
                ))}
              </select>
            </div>

            {/* Load Sheet Data Button */}
            {selectedSheetId && (
              <button
                type="button"
                onClick={loadSheetData}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                โหลดข้อมูลสินค้าจากชีท
              </button>
            )}

            {/* Sheet Data Preview */}
            {sheetData.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  1️⃣ เลือกข้อมูลจาก Google Sheet
                </label>
                <select
                  value={selectedRowIndex}
                  onChange={(e) => setSelectedRowIndex(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded-lg p-2 text-gray-900"
                >
                  {sheetData.map((row, index) => (
                    <option key={index} value={index}>
                      {row['Product Name'] || `Row ${index + 1}`}
                      {row['Content_Topic'] && ` | ${row['Content_Topic']}`}
                    </option>
                  ))}
                </select>

                {/* Show Selected Row Details */}
                {selectedRow && Object.keys(selectedRow).length > 0 && (
                  <div className="mt-3 bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-lg border-2 border-purple-200">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {Object.entries(selectedRow).map(([key, value]) => {
                        if (!value) return null
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

            {/* 2. Google Drive Images */}
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
                    selectedImages.size > 0
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedImages.size} รูป
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {driveImages.map((img) => {
                    const isSelected = selectedImages.has(img.id)
                    return (
                      <div
                        key={img.id}
                        onClick={() => toggleImageSelection(img.id)}
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

            {/* 3. Custom Prompt */}
            {selectedImages.size > 0 && (
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

                {/* Create Button */}
                <div className="mt-6 pt-6 border-t border-purple-200">
                  <button
                    onClick={handleCreate}
                    disabled={creating || selectedImages.size === 0 || !customPrompt.trim()}
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
                        ✨ สร้างรูปด้วย Custom Prompt ({selectedImages.size} รูป)
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
