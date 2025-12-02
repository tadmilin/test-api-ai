import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('payload-token')

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const payload = await getPayload({ config })
    
    // Verify token and get user
    const headers = new Headers()
    headers.set('Authorization', `JWT ${token.value}`)
    const { user } = await payload.auth({ headers })

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Error getting current user:', error)
    return NextResponse.json(
      { error: 'Failed to get user' },
      { status: 500 }
    )
  }
}
