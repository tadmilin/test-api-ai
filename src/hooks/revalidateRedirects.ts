import type { CollectionAfterChangeHook } from 'payload'

export const revalidateRedirects: CollectionAfterChangeHook = async ({ doc, req: { payload } }) => {
  payload.logger.info(`Revalidating redirects`)

  // Call API route to revalidate (avoids Next.js client/server boundary issues)
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}/api/revalidate?tag=redirects`, {
      method: 'POST',
    }).catch(() => {
      // Ignore fetch errors, revalidation is not critical
      payload.logger.warn('Failed to trigger revalidation')
    })
  } catch (error) {
    payload.logger.warn('Failed to trigger revalidation:', error)
  }

  return doc
}
