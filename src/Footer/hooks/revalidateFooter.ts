import type { GlobalAfterChangeHook } from 'payload'

export const revalidateFooter: GlobalAfterChangeHook = async ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info(`Revalidating footer`)

    try {
      await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}/api/revalidate?tag=global_footer`, {
        method: 'POST',
      }).catch(() => {
        payload.logger.warn('Failed to trigger footer revalidation')
      })
    } catch (error) {
      payload.logger.warn('Failed to trigger footer revalidation:', error)
    }
  }

  return doc
}
