'use client'

interface StyleSelectorProps {
  value: 'minimal' | 'classic' | 'graphic'
  onChange: (value: 'minimal' | 'classic' | 'graphic') => void
  mode: 'satori' | 'ai'
}

export default function StyleSelector({ value, onChange, mode }: StyleSelectorProps) {
  const styles = [
    {
      value: 'minimal' as const,
      label: 'Minimal',
      emoji: '⬜',
      description: mode === 'ai' 
        ? 'Clean white background, thin borders, no decorations'
        : 'White theme with simple borders',
      colors: ['#ffffff', '#e5e5e5', '#f9fafb'],
    },
    {
      value: 'classic' as const,
      label: 'Classic',
      emoji: '👑',
      description: mode === 'ai'
        ? 'Luxury marble texture, gold accents, elegant corners'
        : 'Gold and dark green luxury theme',
      colors: ['#f5f1ea', '#d4af37', '#1C3823'],
    },
    {
      value: 'graphic' as const,
      label: 'Graphic',
      emoji: '🎨',
      description: mode === 'ai'
        ? 'Botanical elements, geometric shapes, creative layout'
        : 'Light gray minimal theme',
      colors: ['#f8f6f3', '#a8d5ba', '#ffd6a5'],
    },
  ]

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Template Style {mode === 'ai' && <span className="text-purple-600">(AI Mode)</span>}
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {styles.map((style) => {
          const isSelected = value === style.value

          return (
            <button
              key={style.value}
              type="button"
              onClick={() => onChange(style.value)}
              className={`
                relative p-4 rounded-lg border-2 transition-all text-left
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50 shadow-md' 
                  : 'border-gray-200 bg-white hover:border-gray-300'
                }
              `}
            >
              <div className="flex items-start space-x-3">
                <div className="text-3xl">{style.emoji}</div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{style.label}</div>
                  <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {style.description}
                  </div>
                  <div className="flex gap-1 mt-2">
                    {style.colors.map((color) => (
                      <div
                        key={color}
                        className="w-6 h-6 rounded border border-gray-300"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
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

      {mode === 'ai' && (
        <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
          <div className="font-medium mb-1">🤖 AI will generate:</div>
          <ul className="space-y-0.5">
            <li>• Unique decorative elements for each style</li>
            <li>• Dynamic layouts that never repeat</li>
            <li>• Professional hotel advertisement aesthetic</li>
          </ul>
        </div>
      )}
    </div>
  )
}
