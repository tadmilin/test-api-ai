'use client'

interface ModeToggleProps {
  value: 'satori' | 'ai'
  onChange: (value: 'satori' | 'ai') => void
}

export default function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Template Generation Mode
      </label>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange('satori')}
          className={`
            relative p-4 rounded-lg border-2 transition-all text-left
            ${value === 'satori' 
              ? 'border-green-500 bg-green-50 shadow-md' 
              : 'border-gray-200 bg-white hover:border-gray-300'
            }
          `}
        >
          <div className="flex items-start space-x-3">
            <div className="text-2xl">🎯</div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Consistent (Satori)</div>
              <div className="text-xs text-gray-600 mt-1">
                Pixel-perfect layout, same result every time
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">Fast ⚡</span>
                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">Reliable ✅</span>
                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">Free 🆓</span>
              </div>
            </div>
          </div>
          {value === 'satori' && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => onChange('ai')}
          className={`
            relative p-4 rounded-lg border-2 transition-all text-left
            ${value === 'ai' 
              ? 'border-purple-500 bg-purple-50 shadow-md' 
              : 'border-gray-200 bg-white hover:border-gray-300'
            }
          `}
        >
          <div className="flex items-start space-x-3">
            <div className="text-2xl">🤖</div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Creative (AI)</div>
              <div className="text-xs text-gray-600 mt-1">
                Dynamic design, unique every time
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Creative 🎨</span>
                <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Unique ✨</span>
                <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">Slower ⏱️</span>
              </div>
            </div>
          </div>
          {value === 'ai' && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </button>
      </div>

      {/* Info box */}
      <div className={`mt-3 p-3 rounded-lg text-xs ${
        value === 'satori' ? 'bg-green-50 border border-green-200' : 'bg-purple-50 border border-purple-200'
      }`}>
        {value === 'satori' ? (
          <div>
            <div className="font-medium text-green-900 mb-1">📐 Consistent Mode:</div>
            <ul className="space-y-0.5 text-green-700">
              <li>• Perfect spacing and alignment</li>
              <li>• Same layout every time</li>
              <li>• Best for batch processing</li>
            </ul>
          </div>
        ) : (
          <div>
            <div className="font-medium text-purple-900 mb-1">🎨 Creative Mode:</div>
            <ul className="space-y-0.5 text-purple-700">
              <li>• AI-generated decorative elements</li>
              <li>• Never repeats the same design</li>
              <li>• Requires review & approval step</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
