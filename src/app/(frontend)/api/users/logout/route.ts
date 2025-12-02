import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    const cookieStore = await cookies()
    
    // Delete the auth cookie
    cookieStore.delete('payload-token')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error logging out:', error)
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    )
  }
}
