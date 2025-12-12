import { revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tag = searchParams.get('tag')

    if (!tag) {
      return NextResponse.json({ error: 'Tag is required' }, { status: 400 })
    }

    revalidateTag(tag)

    return NextResponse.json({ revalidated: true, tag, now: Date.now() })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to revalidate', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
