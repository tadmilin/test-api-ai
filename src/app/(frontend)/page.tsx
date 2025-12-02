'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/users/me')
        if (res.ok) {
          // Already logged in, go to dashboard
          router.push('/dashboard')
        } else {
          // Not logged in, go to login
          router.push('/login')
        }
      } catch (error) {
        // Error, go to login
        router.push('/login')
      }
    }

    checkAuth()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-lg">กำลังตรวจสอบ...</div>
    </div>
  )
}

export async function generateMetadata() {
  return {
    title: 'Image Generation Dashboard',
    description: 'AI-powered image generation workflow',
  }
}
