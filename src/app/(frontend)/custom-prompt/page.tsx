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
    
    if (!sheetId) {
      setSheetData([])
      return
    }

    try {
      const res = await fetch(`/api/sheets/read?spreadsheetId=${sheetId}`)
      if (res.ok) {
        const data = await res.json()
        setSheetData(data.rows || [])
      }
    } catch (error) {
      console.error('Error reading sheet:', error)
    }
  }

  async function handleFolderSelect(folderId: string) {
    setSelectedFolderId(folderId)
    setSelectedImages(new Set())
    
    if (!folderId || !driveFolderId) {
      setDriveImages([])
      return
    }

    try {
      const res = await fetch(`/api/drive/images?folderId=${folderId}&driveId=${driveFolderId}`)
      if (res.ok) {
        const data = await res.json()
        
        const images = (data.files || []).map((file: { id: string; name: string; thumbnailLink?: string; webContentLink?: string }) => ({
          id: file.id,
          name: file.name,
          thumbnailUrl: getGoogleDriveThumbnail(file.id),
          url: file.webContentLink || `https://drive.google.com/uc?export=view&id=${file.id}`,
        }))
        
        setDriveImages(images)
      }
    } catch (error) {
      console.error('Error fetching images:', error)
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

      setProcessingStatus('✅ เริ่มประมวลผลสำเร็จ! รอ 30-60 วินาที...')
      
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

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
                1️⃣ เลือก Google Sheet (แสดงข้อมูล Product/Topic)
              </label>
              <select
                value={selectedSheetId}
                onChange={(e) => handleSheetSelect(e.target.value)}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">-- เลือก Sheet --</option>
                {spreadsheets.map((sheet) => (
                  <option key={sheet.id} value={sheet.id}>{sheet.name}</option>
                ))}
              </select>
            </div>

            {/* Sheet Data Preview */}
            {sheetData.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  เลือกแถวข้อมูล:
                </label>
                <select
                  value={selectedRowIndex}
                  onChange={(e) => setSelectedRowIndex(Number(e.target.value))}
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-2 mb-3"
                >
                  {sheetData.map((row, index) => (
                    <option key={index} value={index}>
                      {row['Product Name'] || row['Content_Topic'] || `Row ${index + 1}`}
                    </option>
                  ))}
                </select>
                <div className="text-sm text-gray-700 space-y-1">
                  {selectedRow['Product Name'] && <p><strong>Product:</strong> {selectedRow['Product Name']}</p>}
                  {selectedRow['Content_Topic'] && <p><strong>Topic:</strong> {selectedRow['Content_Topic']}</p>}
                  {selectedRow['Product Description'] && <p><strong>Description:</strong> {selectedRow['Product Description']}</p>}
                </div>
              </div>
            )}

            {/* 2. Select Drive Folder */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                2️⃣ เลือก Drive  
              </label>
              {driveFolders.length > 0 && (
                <select
                  value={driveFolderId}
                  onChange={(e) => handleDriveFolderChange(e.target.value)}
                  className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 mb-4 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">-- เลือก Drive --</option>
                  {driveFolders.map((drive) => (
                    <option key={drive.driveId} value={drive.driveId}>{drive.driveName}</option>
                  ))}
                </select>
              )}
              
              {driveFolderId && driveFolders.find(d => d.driveId === driveFolderId)?.folders && (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    เลือก Folder (รูปอ้างอิง)
                  </label>
                  <FolderTree
                    folders={driveFolders.find(d => d.driveId === driveFolderId)?.folders || []}
                    onSelectFolder={handleFolderSelect}
                    selectedFolderId={selectedFolderId}
                  />
                </>
              )}
            </div>

            {/* 3. Select Images */}
            {driveImages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  3️⃣ เลือกรูป ({selectedImages.size} รูป)
                </label>
                <div className="grid grid-cols-4 gap-4">
                  {driveImages.map((image) => {
                    const isSelected = selectedImages.has(image.id)
                    return (
                      <div
                        key={image.id}
                        onClick={() => toggleImageSelection(image.id)}
                        className={`relative cursor-pointer rounded-lg overflow-hidden border-4 transition-all ${
                          isSelected ? 'border-purple-500 shadow-lg' : 'border-gray-200 hover:border-purple-300'
                        }`}
                      >
                        <Image
                          src={image.thumbnailUrl}
                          alt={image.name}
                          width={200}
                          height={200}
                          className="w-full h-32 object-cover"
                          unoptimized
                        />
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-purple-500 text-white rounded-full w-8 h-8 flex items-center justify-center">
                            ✓
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 4. Custom Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                4️⃣ เขียน Prompt (คำสั่งให้ AI ตกแต่งรูป)
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={6}
                placeholder="เช่น: ทำให้รูปสว่างขึ้น เพิ่มความคมชัด และปรับสีให้สดใส..."
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-2">
                💡 เคล็ดลับ: อธิบายให้ละเอียด ใช้ภาษาไทยหรืออังกฤษก็ได้ (ยาว {customPrompt.length} ตัวอักษร)
              </p>
            </div>

            {/* Create Button */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <button
                onClick={handleCreate}
                disabled={creating || selectedImages.size === 0 || !customPrompt.trim()}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    กำลังสร้าง...
                  </>
                ) : (
                  <>
                    ✨ สร้างรูป ({selectedImages.size} รูป)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
