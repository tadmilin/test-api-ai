'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TextToImagePage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const outputFormat = 'jpg' // ✅ Fixed to JPG for optimization
  const [numImages, setNumImages] = useState(1)
  const [outputSize, setOutputSize] = useState('1:1-2K')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!prompt.trim()) {
      setError('กรุณากรอก Prompt')
      return
    }

    if (prompt.length < 10) {
      setError('Prompt ต้องมีความยาวอย่างน้อย 10 ตัวอักษร')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/generate/text-to-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          outputSize,
          outputFormat,
          numImages,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(data.error || 'Failed to generate image')
      }

      const data = await res.json()
      console.log('✅ Job created:', data.jobId)

      // Save to localStorage for dashboard polling
      localStorage.setItem('fromTextToImage', 'true')
      localStorage.setItem('processingJobId', data.jobId)

      // Redirect to dashboard
      router.push('/dashboard')

    } catch (err) {
      console.error('Generate error:', err)
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            ✨ Text to Image
          </h1>
          <p className="text-gray-600 text-lg">
            สร้างภาพจาก Prompt ด้วย Google Imagen 4 Ultra
          </p>
        </div>

        {/* Main Form */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Prompt Input */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                🎨 Prompt (คำอธิบายภาพที่ต้องการ)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="ตัวอย่าง: A serene beach at sunset with palm trees and gentle waves, photorealistic style"
                rows={6}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none text-gray-900 placeholder:text-gray-500"
              />
              <div className="mt-2 text-sm text-gray-500">
                ใช้ภาษาอังกฤษได้ผลดีที่สุด • ควรมีรายละเอียด • อย่างน้อย 10 ตัวอักษร
              </div>
            </div>

            {/* Number of Images */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-3">
                🔢 จำนวนภาพ
              </label>
              <div className="flex gap-3">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setNumImages(num)}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-semibold transition-all ${
                      numImages === num
                        ? 'border-purple-600 bg-purple-50 text-purple-700'
                        : 'border-gray-300 hover:border-purple-400 text-gray-900'
                    }`}
                  >
                    {num} รูป
                  </button>
                ))}
              </div>
              <div className="mt-2 text-sm text-gray-500">
                ⏱️ แต่ละรูปใช้เวลาประมาณ 30-60 วินาที
              </div>
            </div>

            {/* Output Size Selection */}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-3">
                📐 ขนาดรูปที่ต้องการ
              </label>
              <select
                value={outputSize}
                onChange={(e) => setOutputSize(e.target.value)}
                className="w-full border-2 border-gray-300 rounded-lg px-4 py-3 text-gray-900 font-medium focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="1:1-2K">1:1 Square (2048×2048) - FB/IG Feed</option>
                <option value="4:5-2K">3:4 Portrait (1080×1350) - FB/IG Feed</option>
                <option value="9:16-2K">9:16 Vertical (1080×1920) - Story/TikTok</option>
              </select>
              <div className="mt-2 text-sm text-gray-500">
                💡 Imagen 4 Ultra สร้างคุณภาพสูงในขนาดดังกล่าว แล้ว resize เป็นขนาดที่ต้องการ
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                <p className="text-red-700 font-medium">❌ {error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="flex-1 bg-gray-200 text-gray-700 py-4 px-6 rounded-lg font-bold hover:bg-gray-300 transition-all"
                disabled={loading}
              >
                ← ย้อนกลับ
              </button>
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 px-6 rounded-lg font-bold hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>กำลังสร้างภาพ...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span>✨</span>
                    <span>สร้างภาพ ({numImages} รูป)</span>
                  </div>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
          <h3 className="font-bold text-blue-900 mb-3">💡 เทคนิคการเขียน Prompt ที่ดี</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li>✅ ระบุรายละเอียดที่ชัดเจน (วัตถุ, สี, แสง, มุมมอง)</li>
            <li>✅ ใช้คำคุณศัพท์เยอะๆ (beautiful, detailed, cinematic, vibrant)</li>
            <li>✅ ระบุสไตล์ถ้าต้องการ (photorealistic, anime style, oil painting)</li>
            <li>✅ หลีกเลี่ยงคำที่คลุมเครือหรือขัดแย้งกัน</li>
            <li>✅ ใช้ภาษาอังกฤษจะได้ผลลัพธ์ที่ดีกว่า</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
