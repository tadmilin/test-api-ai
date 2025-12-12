import type { GlobalAfterChangeHook } from 'payload'

export const revalidateHeader: GlobalAfterChangeHook = async ({ doc, req: { payload, context } }) => {
  if (!context.disableRevalidate) {
    payload.logger.info(`Revalidating header`)

    try {
      await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}/api/revalidate?tag=global_header`, {
        method: 'POST',
      }).catch(() => {
        payload.logger.warn('Failed to trigger header revalidation')
      })
    } catch (error) {
      payload.logger.warn('Failed to trigger header revalidation:', error)
    }
  }

  return doc
}
