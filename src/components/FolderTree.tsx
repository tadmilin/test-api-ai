'use client'

import { useState } from 'react'

export interface TreeFolder {
  id: string
  name: string
  path: string
  imageCount: number
  children: TreeFolder[]
  level: number
}

interface FolderTreeProps {
  folders: TreeFolder[]
  onSelectFolder: (folderId: string) => void
  selectedFolderId: string
}

export function FolderTree({ folders, onSelectFolder, selectedFolderId }: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const toggleExpand = (folderId: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)
  }

  const renderFolder = (folder: TreeFolder) => {
    const isExpanded = expandedFolders.has(folder.id)
    const hasChildren = folder.children.length > 0
    const isSelected = selectedFolderId === folder.id
    const hasImages = folder.imageCount > 0

    const handleFolderClick = () => {
      if (hasChildren) {
        // Parent folder: only toggle expand/collapse
        toggleExpand(folder.id)
      } else if (hasImages) {
        // Leaf folder with images: select for loading
        onSelectFolder(folder.id)
      }
      // If no children and no images: do nothing (no alert)
    }

    return (
      <div key={folder.id}>
        <div
          onClick={handleFolderClick}
          className={`flex items-center gap-2 py-2 px-3 hover:bg-gray-100 cursor-pointer rounded transition-colors ${
            isSelected ? 'bg-blue-100 border-l-4 border-blue-500' : ''
          }`}
          style={{ paddingLeft: `${folder.level * 20 + 12}px` }}
        >
          {/* Expand/Collapse Icon */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(folder.id)
              }}
              className="w-4 h-4 flex items-center justify-center text-gray-600 hover:text-gray-900"
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && <span className="w-4" />}

          {/* Folder Info */}
          <div className="flex-1 flex items-center gap-2">
            <span className="text-lg">📁</span>
            <span className={`text-sm ${isSelected ? 'font-semibold text-blue-700' : 'text-gray-900'}`}>
              {folder.name}
            </span>
            {hasImages && (
              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                {folder.imageCount} รูป
              </span>
            )}
          </div>
        </div>

        {/* Render Children */}
        {isExpanded && hasChildren && (
          <div>
            {folder.children.map((child) => renderFolder(child))}
          </div>
        )}
      </div>
    )
  }

  if (folders.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-8">
        ไม่พบโฟลเดอร์ที่มีรูปภาพ
      </div>
    )
  }

  return (
    <div className="border border-gray-300 rounded-lg bg-white max-h-96 overflow-y-auto">
      {folders.map((folder) => renderFolder(folder))}
    </div>
  )
}
