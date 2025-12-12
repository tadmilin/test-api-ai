import { revalidatePath, revalidateTag } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tag = searchParams.get('tag')
    const path = searchParams.get('path')

    if (!tag && !path) {
      return NextResponse.json({ error: 'Tag or path is required' }, { status: 400 })
    }

    if (tag) {
      revalidateTag(tag)
    }
    
    if (path) {
      revalidatePath(path)
    }

    return NextResponse.json({ revalidated: true, tag, path, now: Date.now() })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to revalidate', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
