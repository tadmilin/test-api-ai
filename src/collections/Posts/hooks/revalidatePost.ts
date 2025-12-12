import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import type { Post } from '../../../payload-types'

const revalidate = async (path?: string, tag?: string) => {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
    if (path) {
      await fetch(`${baseUrl}/api/revalidate?path=${encodeURIComponent(path)}`, { method: 'POST' }).catch(() => {})
    }
    if (tag) {
      await fetch(`${baseUrl}/api/revalidate?tag=${tag}`, { method: 'POST' }).catch(() => {})
    }
  } catch {}
}

export const revalidatePost: CollectionAfterChangeHook<Post> = async ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = `/posts/${doc.slug}`
      payload.logger.info(`Revalidating post at path: ${path}`)
      await revalidate(path, 'posts-sitemap')
    }

    // If the post was previously published, we need to revalidate the old path
    if (previousDoc._status === 'published' && doc._status !== 'published') {
      const oldPath = `/posts/${previousDoc.slug}`
      payload.logger.info(`Revalidating old post at path: ${oldPath}`)
      await revalidate(oldPath, 'posts-sitemap')
    }
  }
  return doc
}

export const revalidateDelete: CollectionAfterDeleteHook<Post> = async ({ doc, req: { context } }) => {
  if (!context.disableRevalidate) {
    const path = `/posts/${doc?.slug}`
    await revalidate(path, 'posts-sitemap')
  }
  return doc
}
