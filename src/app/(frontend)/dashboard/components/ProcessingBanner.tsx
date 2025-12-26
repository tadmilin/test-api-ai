/**
 * ProcessingBanner Component
 * Shows job processing status
 */

interface ProcessingBannerProps {
  status: string
  onDismiss?: () => void
  canDismiss?: boolean
}

export function ProcessingBanner({ 
  status, 
  onDismiss,
  canDismiss = true 
}: ProcessingBannerProps) {
  if (!status) return null
  
  const isError = status.includes('❌')
  const isSuccess = status.includes('✅')
  const isWarning = status.includes('⚠️')
  
  const bgColor = isError 
    ? 'bg-red-50 border-red-200' 
    : isSuccess 
    ? 'bg-green-50 border-green-200'
    : isWarning
    ? 'bg-yellow-50 border-yellow-200'
    : 'bg-blue-50 border-blue-200'
  
  const textColor = isError 
    ? 'text-red-900' 
    : isSuccess 
    ? 'text-green-900'
    : isWarning
    ? 'text-yellow-900'
    : 'text-blue-900'
  
  return (
    <div className={`fixed top-4 right-4 z-50 ${bgColor} border-2 rounded-lg shadow-lg p-4 min-w-[300px] max-w-md`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`${textColor} font-medium flex-1`}>
          {status}
        </div>
        {canDismiss && onDismiss && (
          <button
            onClick={onDismiss}
            className={`${textColor} hover:opacity-70 transition-opacity flex-shrink-0 text-xl font-bold leading-none`}
            aria-label="Close"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
