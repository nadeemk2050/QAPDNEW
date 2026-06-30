import React, { useState, useEffect, useRef } from 'react'
import { Search, Star, Clock, ChevronDown, Check, X } from 'lucide-react'

export default function SearchableSelect({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select option...',
  favoriteKey = '',
  recentKey = '',
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  
  // Favorites State
  const [favorites, setFavorites] = useState(() => {
    if (!favoriteKey) return []
    try {
      const saved = localStorage.getItem(favoriteKey)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // Recents State
  const [recents, setRecents] = useState(() => {
    if (!recentKey) return []
    try {
      const saved = localStorage.getItem(recentKey)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const containerRef = useRef(null)
  const listRef = useRef(null)
  const searchInputRef = useRef(null)

  // Sync favorites in localStorage
  const toggleFavorite = (e, id) => {
    e.stopPropagation()
    const updated = favorites.includes(id)
      ? favorites.filter(fid => fid !== id)
      : [...favorites, id]
    setFavorites(updated)
    if (favoriteKey) {
      localStorage.setItem(favoriteKey, JSON.stringify(updated))
    }
  }

  // Handle select action
  const handleSelect = (id) => {
    onChange(id)
    setIsOpen(false)
    setSearch('')
    
    if (recentKey && id) {
      const updated = [id, ...recents.filter(rid => rid !== id)].slice(0, 5)
      setRecents(updated)
      localStorage.setItem(recentKey, JSON.stringify(updated))
    }
  }

  // Filter option items
  const filteredOptions = options.filter(o => 
    (o.name || '').toLowerCase().includes(search.toLowerCase())
  )

  const favoriteOptions = options.filter(o => favorites.includes(o.id))
  
  const recentOptions = options.filter(o => 
    recents.includes(o.id) && !favorites.includes(o.id)
  )

  // Build the unified list of items displayed in the dropdown
  const getVisibleItems = () => {
    if (search.trim()) {
      return filteredOptions.map(o => ({ ...o, group: 'all' }))
    }
    const list = []
    favoriteOptions.forEach(o => list.push({ ...o, group: 'favorite' }))
    recentOptions.forEach(o => list.push({ ...o, group: 'recent' }))
    options.forEach(o => list.push({ ...o, group: 'all' }))
    
    // De-duplicate items to prevent navigation bugs
    const seen = new Set()
    return list.filter(o => {
      const key = `${o.group}-${o.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const visibleItems = getVisibleItems()

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-focus search input and reset highlighting on open
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(0)
      setTimeout(() => searchInputRef.current?.focus(), 60)
    } else {
      setHighlightedIndex(-1)
      setSearch('')
    }
  }, [isOpen])

  // Scroll active item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector('.highlighted-item')
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        setHighlightedIndex(prev => (prev < visibleItems.length - 1 ? prev + 1 : 0))
        e.preventDefault()
        break
      case 'ArrowUp':
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : visibleItems.length - 1))
        e.preventDefault()
        break
      case 'Enter':
        if (highlightedIndex >= 0 && highlightedIndex < visibleItems.length) {
          handleSelect(visibleItems[highlightedIndex].id)
        }
        e.preventDefault()
        break
      case 'Escape':
        setIsOpen(false)
        e.preventDefault()
        break
      default:
        break
    }
  }

  const selectedOption = options.find(o => o.id === value)

  return (
    <div 
      ref={containerRef} 
      className={`relative ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm 
                   flex items-center justify-between outline-none transition-all
                   focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 text-left font-semibold text-slate-700"
      >
        <span className={selectedOption ? 'text-slate-800' : 'text-slate-400 font-normal'}>
          {selectedOption 
            ? `${selectedOption.name} ${selectedOption.details || ''}` 
            : placeholder
          }
        </span>
        <div className="flex items-center gap-1.5">
          {value && (
            <span 
              onClick={(e) => {
                e.stopPropagation()
                handleSelect('')
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border-2 border-slate-200 rounded-2xl shadow-xl max-h-80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
            <Search size={14} className="text-slate-400 ml-1 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full bg-transparent border-0 outline-none text-xs text-slate-800 placeholder:text-slate-400 py-1.5"
            />
          </div>

          {/* Options List */}
          <div 
            ref={listRef} 
            className="flex-1 overflow-y-auto max-h-60 p-1 space-y-0.5"
          >
            {visibleItems.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs italic">
                No matching accounts found
              </div>
            ) : (
              (() => {
                let lastGroup = null
                return visibleItems.map((item, idx) => {
                  const isHighlighted = idx === highlightedIndex
                  const isSelected = item.id === value
                  const isFav = favorites.includes(item.id)
                  
                  const showHeader = item.group !== lastGroup
                  lastGroup = item.group

                  const groupLabel = item.group === 'favorite' 
                    ? 'Favorite Accounts' 
                    : item.group === 'recent' 
                      ? 'Recently Used' 
                      : search ? 'Search Results' : 'All Accounts'

                  return (
                    <React.Fragment key={`${item.group}-${item.id}`}>
                      {showHeader && (
                        <div className="text-[9px] font-bold text-indigo-500 bg-slate-50/80 uppercase tracking-widest px-2.5 py-1.5 rounded-lg mt-1 first:mt-0 select-none">
                          {groupLabel}
                        </div>
                      )}
                      <div
                        onClick={() => handleSelect(item.id)}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-left text-xs font-semibold cursor-pointer transition-all select-none
                          ${isHighlighted 
                            ? 'highlighted-item bg-indigo-50 text-indigo-700' 
                            : isSelected 
                              ? 'bg-indigo-50/40 text-indigo-600' 
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        <div className="min-w-0 pr-2">
                          <span className="block truncate font-bold uppercase tracking-wide">
                            {item.name}
                          </span>
                          {item.details && (
                            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                              {item.details}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Favorite Toggle Star */}
                          <button
                            type="button"
                            onClick={(e) => toggleFavorite(e, item.id)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isFav 
                                ? 'text-amber-500 hover:bg-amber-50' 
                                : 'text-slate-300 hover:text-amber-500 hover:bg-slate-100'
                            }`}
                            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Star size={12} className={isFav ? 'fill-current' : ''} />
                          </button>
                          {isSelected && <Check size={12} className="text-indigo-600 mr-1" />}
                        </div>
                      </div>
                    </React.Fragment>
                  )
                })
              })()
            )}
          </div>
        </div>
      )}
    </div>
  )
}
