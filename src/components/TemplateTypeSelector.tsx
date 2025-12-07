'use client'

interface TemplateTypeSelectorProps {
  value: 'single' | 'dual' | 'triple' | 'quad'
  onChange: (value: 'single' | 'dual' | 'triple' | 'quad') => void
  maxImages?: number
}

export default function TemplateTypeSelector({ value, onChange, maxImages }: TemplateTypeSelectorProps) {
  const types = [
    { value: 'single' as const, label: '1 รูป', count: 1, icon: '🖼️' },
    { value: 'dual' as const, label: '2 รูป', count: 2, icon: '🖼️🖼️' },
    { value: 'triple' as const, label: '3 รูป', count: 3, icon: '🖼️🖼️🖼️' },
    { value: 'quad' as const, label: '4 รูป', count: 4, icon: '🖼️🖼️🖼️🖼️' },
  ]

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Template Type (จำนวนรูป)
      </label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {types.map((type) => {
          const isDisabled = maxImages ? type.count > maxImages : false
          const isSelected = value === type.value

          return (
            <button
              key={type.value}
              type="button"
              onClick={() => !isDisabled && onChange(type.value)}
              disabled={isDisabled}
              className={`
                relative p-4 rounded-lg border-2 transition-all
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50 shadow-md' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
                }
                ${isDisabled 
                  ? 'opacity-40 cursor-not-allowed' 
                  : 'cursor-pointer hover:shadow-sm'
                }
              `}
            >
              <div className="text-2xl mb-2">{type.icon}</div>
              <div className="font-medium text-gray-900">{type.label}</div>
              <div className="text-xs text-gray-500 mt-1">
                {type.count === 1 ? 'Single Frame' : 
                 type.count === 2 ? 'Split Screen' : 
                 type.count === 3 ? 'Hero Grid' : 
                 'Grid Layout'}
              </div>
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
      </div>
      {maxImages && maxImages < 4 && (
        <p className="text-xs text-amber-600 mt-2">
          ⚠️ คุณเลือกรูปไว้ {maxImages} รูป - Template แบบ {maxImages + 1} รูปขึ้นไปจะถูกปิด
        </p>
      )}
    </div>
  )
}
