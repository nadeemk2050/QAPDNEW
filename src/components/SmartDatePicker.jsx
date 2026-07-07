import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function parseDateSafe(str) {
  if (!str) return null
  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

function formatDisplayMonth(monthStr) {
  if (!monthStr) return '—'
  const [y, m] = monthStr.split('-').map(Number)
  if (!y || !m) return monthStr
  return `${MONTHS[m - 1] || ''} ${y}`
}

export default function SmartDatePicker({
  value,
  onChange,
  mode = 'date',       // 'date' or 'month'
  className = '',
  placeholder = 'Select date',
  align = 'left',       // popover alignment: 'left' or 'right'
}) {
  const [open, setOpen] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const popoverRef = useRef(null)

  // Calendar navigation state (for date mode)
  const parsed = parseDateSafe(value)
  const [navYear, setNavYear] = useState(parsed ? parsed.getFullYear() : new Date().getFullYear())
  const [navMonth, setNavMonth] = useState(parsed ? parsed.getMonth() : new Date().getMonth())

  // Sync calendar nav when value changes externally
  useEffect(() => {
    if (parsed) {
      setNavYear(parsed.getFullYear())
      setNavMonth(parsed.getMonth())
    }
  }, [value])

  // Close on click outside (checks both container and popover since popover is portaled)
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOpen(false)
        setShowManual(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Recompute position on scroll/resize while open
  useEffect(() => {
    if (!open) return
    const updatePos = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPopoverPos({
          top: rect.bottom + 6,
          left: align === 'right' ? rect.right - 260 : rect.left,
        })
      }
    }
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open, align])

  const toggleOpen = useCallback(() => {
    setOpen(prev => {
      if (!prev && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setPopoverPos({
          top: rect.bottom + 6,
          left: align === 'right' ? rect.right - 260 : rect.left,
        })
      }
      return !prev
    })
    setShowManual(false)
    setManualInput('')
  }, [align])

  // ── Calendar helpers ──
  const prevMonth = useCallback(() => {
    setNavMonth(prev => {
      if (prev === 0) { setNavYear(y => y - 1); return 11 }
      return prev - 1
    })
  }, [])

  const nextMonth = useCallback(() => {
    setNavMonth(prev => {
      if (prev === 11) { setNavYear(y => y + 1); return 0 }
      return prev + 1
    })
  }, [])

  const goToToday = useCallback(() => {
    const today = new Date()
    setNavYear(today.getFullYear())
    setNavMonth(today.getMonth())
  }, [])

  const handleDayClick = useCallback((day) => {
    const y = navYear
    const m = String(navMonth + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    onChange(`${y}-${m}-${d}`)
    setOpen(false)
    setShowManual(false)
  }, [navYear, navMonth, onChange])

  const handleMonthSelect = useCallback((mIndex) => {
    const y = navYear
    const m = String(mIndex + 1).padStart(2, '0')
    onChange(`${y}-${m}`)
    setOpen(false)
    setShowManual(false)
  }, [navYear, onChange])

  const handleManualSubmit = useCallback(() => {
    const trimmed = manualInput.trim()
    if (!trimmed) return

    // Try parsing common formats
    let parsedDate = null

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed)
      if (!isNaN(d.getTime())) parsedDate = trimmed
    }
    // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    else if (/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/.test(trimmed)) {
      const [, dd, mm, yyyy] = trimmed.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/)
      const d = new Date(`${yyyy}-${mm}-${dd}`)
      if (!isNaN(d.getTime())) {
        parsedDate = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
      }
    }
    // DD Mon YYYY or DD-Mon-YYYY (e.g., "07 Jul 2026")
    else if (/^(\d{1,2})[-/.\s]([A-Za-z]{3})[-/.\s](\d{4})$/.test(trimmed)) {
      const [, dd, mmm, yyyy] = trimmed.match(/^(\d{1,2})[-/.\s]([A-Za-z]{3})[-/.\s](\d{4})$/)
      const monthIndex = MONTHS.findIndex(m => m.toLowerCase() === mmm.toLowerCase())
      if (monthIndex >= 0) {
        const m = String(monthIndex + 1).padStart(2, '0')
        const d = String(dd).padStart(2, '0')
        const dateObj = new Date(`${yyyy}-${m}-${d}`)
        if (!isNaN(dateObj.getTime())) {
          parsedDate = `${yyyy}-${m}-${d}`
        }
      }
    }

    if (parsedDate) {
      onChange(parsedDate)
      setOpen(false)
      setShowManual(false)
    } else {
      alert('Invalid date format. Use YYYY-MM-DD, DD-MM-YYYY, or DD Mon YYYY (e.g., 07 Jul 2026)')
    }
  }, [manualInput, onChange])

  // ── Render calendar grid for date mode ──
  const renderCalendar = () => {
    const dim = daysInMonth(navYear, navMonth)
    const firstDay = new Date(navYear, navMonth, 1).getDay() // 0=Sun
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const days = []
    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-8 h-8" />)
    }
    for (let day = 1; day <= dim; day++) {
      const y = navYear
      const m = String(navMonth + 1).padStart(2, '0')
      const d = String(day).padStart(2, '0')
      const dateStr = `${y}-${m}-${d}`
      const isSelected = value === dateStr
      const isToday = dateStr === todayStr

      days.push(
        <button
          key={day}
          onClick={() => handleDayClick(day)}
          className={`w-8 h-8 rounded-full text-[11px] font-semibold flex items-center justify-center transition-all
            ${isSelected
              ? 'bg-indigo-600 text-white shadow-sm scale-105'
              : isToday
                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                : 'text-slate-700 hover:bg-slate-100'
            }
          `}
        >
          {day}
        </button>
      )
    }
    return days
  }

  // ── Render month grid for month mode ──
  const renderMonthGrid = () => {
    const currentVal = value || ''
    return (
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {MONTHS.map((mName, idx) => {
          const mStr = String(idx + 1).padStart(2, '0')
          const monthVal = `${navYear}-${mStr}`
          const isSelected = currentVal === monthVal
          const now = new Date()
          const isCurrent = now.getFullYear() === navYear && now.getMonth() === idx

          return (
            <button
              key={idx}
              onClick={() => handleMonthSelect(idx)}
              className={`px-2 py-2 rounded-lg text-[11px] font-semibold transition-all
                ${isSelected
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isCurrent
                    ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                    : 'text-slate-700 hover:bg-slate-100'
                }
              `}
            >
              {mName}
            </button>
          )
        })}
      </div>
    )
  }

  const displayText = mode === 'month'
    ? formatDisplayMonth(value)
    : formatDisplayDate(value)

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="flex items-center justify-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-200 hover:border-indigo-400 transition-colors text-center select-none cursor-pointer"
      >
        <span className="text-[10px] font-extrabold text-indigo-600 whitespace-nowrap">
          {displayText}
        </span>
      </button>

      {/* Popover — portaled to body to escape parent stacking contexts */}
      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, zIndex: 99999 }}
          className="bg-white border border-slate-200 rounded-xl shadow-xl min-w-[260px]"
        >
          {/* Header with navigation */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
            <button
              type="button"
              onClick={mode === 'month' ? () => setNavYear(y => y - 1) : prevMonth}
              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>

            <button
              type="button"
              onClick={goToToday}
              className="text-[11px] font-extrabold text-slate-700 hover:text-indigo-600 transition-colors"
            >
              {mode === 'month'
                ? `${navYear}`
                : `${MONTHS[navMonth]} ${navYear}`
              }
            </button>

            <button
              type="button"
              onClick={mode === 'month' ? () => setNavYear(y => y + 1) : nextMonth}
              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Calendar / Month grid */}
          <div className="p-2">
            {mode === 'month' ? renderMonthGrid() : (
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="w-8 h-6 flex items-center justify-center text-[9px] font-bold text-slate-400 uppercase">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Days grid */}
                <div className="grid grid-cols-7 gap-0.5">
                  {renderCalendar()}
                </div>
              </>
            )}
          </div>

          {/* Manual input toggle & field */}
          <div className="border-t border-slate-100 px-3 py-2">
            {!showManual ? (
              <button
                type="button"
                onClick={() => {
                  setShowManual(true)
                  setManualInput(value || '')
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
                className="w-full text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg py-1.5 transition-colors text-center"
              >
                ✏️ Type date manually
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleManualSubmit() }}
                  placeholder={mode === 'month' ? 'YYYY-MM' : 'DD-MM-YYYY or DD Mon YYYY'}
                  className="flex-1 px-2 py-1.5 text-[11px] border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  className="px-2.5 py-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Set
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
