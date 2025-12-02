import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/dashboard')
}

export async function generateMetadata() {
  return {
    title: 'Image Generation Dashboard',
    description: 'AI-powered image generation workflow',
  }
}
