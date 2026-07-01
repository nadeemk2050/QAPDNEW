import React, { useState, useEffect } from 'react'
import { ArrowLeft, X, Search, Calendar, RefreshCw, AlertCircle, FileText } from 'lucide-react'
import { listLogs } from '../api'

export default function SystemLogs({ onClose }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [debugInfo, setDebugInfo] = useState(null)
  const pageSize = 15

  const fetchLogsData = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listLogs()
      setLogs(res.logs || [])
    } catch (e) {
      setError(e.message || 'Failed to load system logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogsData()
    // Diagnostic query to inspect offline_records
    import('../localDB').then(async ({ getDB }) => {
      try {
        const companyDB = await getDB()
        if (companyDB?.offline_records) {
          const allDocs = await companyDB.offline_records.find().exec()
          const counts = {}
          let sampleDoc = null
          allDocs.forEach(d => {
            const col = d.collectionName || 'unknown'
            counts[col] = (counts[col] || 0) + 1
            if ((col.includes('log') || col.includes('system') || col.includes('activity') || col.includes('audit')) && !sampleDoc) {
              const hasQapd = JSON.stringify(d.data || {}).includes('(QAPD)')
              if (!hasQapd || !sampleDoc) {
                sampleDoc = { collectionName: col, id: d.id, keys: Object.keys(d.data || {}), data: d.data }
              }
            }
          })
          setDebugInfo({ counts, sampleDoc })
        }
      } catch (e) {
        console.error('Debug query failed:', e)
      }
    })
  }, [])

  // Filter logs
  const filtered = logs.filter(log => {
    // 1. Global Search
    if (search.trim()) {
      const s = search.toLowerCase()
      const match = (log.docName || '').toLowerCase().includes(s) ||
                    (log.refNo || '').toLowerCase().includes(s) ||
                    (log.status || '').toLowerCase().includes(s) ||
                    (log.userEmail || '').toLowerCase().includes(s) ||
                    (log.newValue || '').toLowerCase().includes(s) ||
                    (log.oldValue || '').toLowerCase().includes(s)
      if (!match) return false
    }

    // 2. Date Range Filter
    if (startDate) {
      if (!log.voucherDate || log.voucherDate < startDate) return false
    }
    if (endDate) {
      if (!log.voucherDate || log.voucherDate > endDate) return false
    }

    return true
  })

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const formatDateTime = (ts) => {
    if (!ts) return '—'
    try {
      const d = new Date(ts)
      return d.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
    } catch { return String(ts) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col h-full text-slate-800 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-black text-slate-800">System Log</h1>
            <p className="text-[10px] text-slate-500 font-medium">Real-time action audit trail</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchLogsData}
            disabled={loading}
            className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl transition-all active:scale-[0.97]"
            title="Refresh Log"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="bg-white border-b border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Global Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="GLOBAL SEARCH: Type ref numbers, users, amounts..."
            className="input-field pl-9 pr-4 py-2 text-xs w-full placeholder:text-slate-400"
          />
        </div>

        {/* Date Filters */}
        <div className="flex items-center gap-2 sm:col-span-2">
          <div className="flex-1 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase">From</span>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
              className="bg-transparent border-0 p-0 text-xs text-slate-700 w-full focus:outline-none focus:ring-0"
            />
          </div>
          <div className="flex-1 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase">To</span>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
              className="bg-transparent border-0 p-0 text-xs text-slate-700 w-full focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      </div>

      {/* Table Logs View */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-9 h-9 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-xs text-slate-500 mt-3 font-medium">Loading system logs...</p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-slate-400">
            <FileText size={40} className="mx-auto mb-2 opacity-30 animate-pulse" />
            <p className="text-sm font-bold">No system logs found</p>
            <p className="text-xs mt-1">Actions performed will appear here automatically</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden border border-slate-200 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px] whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-900 text-white border-b border-slate-700 text-[10px] font-bold uppercase tracking-wider select-none">
                    <th className="p-3">Time</th>
                    <th className="p-3">Doc Details / Name</th>
                    <th className="p-3">Ref / Voucher No.</th>
                    <th className="p-3">Voucher Date</th>
                    <th className="p-3 text-right">Old Value</th>
                    <th className="p-3 text-right">New Value</th>
                    <th className="p-3">Added/Edited By</th>
                    <th className="p-3 text-center">Latest Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700 bg-white">
                  {paginated.map((log) => {
                    const statusLower = (log.status || '').toLowerCase()
                    const statusClass = 
                      statusLower === 'created' ? 'bg-green-50 text-green-700 border-green-200' :
                      statusLower === 'edited' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-red-50 text-red-700 border-red-200'

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-3 text-slate-400 font-mono text-[10px]">{formatDateTime(log.timestamp)}</td>
                        <td className="p-3 text-slate-800 font-bold uppercase">{log.docName || '—'}</td>
                        <td className="p-3 font-mono font-bold text-slate-900">{log.refNo || '—'}</td>
                        <td className="p-3 font-mono text-slate-500">{log.voucherDate ? new Date(log.voucherDate).toLocaleDateString('en-IN') : '—'}</td>
                        <td className="p-3 text-right text-slate-400 font-mono font-bold">{log.oldValue || '—'}</td>
                        <td className="p-3 text-right text-indigo-700 font-mono font-black">{log.newValue || '—'}</td>
                        <td className="p-3 text-slate-500 text-[10px]">{log.userEmail || '—'}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black border uppercase tracking-wider ${statusClass}`}>
                            {log.status || '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Debug Diagnosis Panel (Always Visible at Bottom) */}
        {debugInfo && (
          <div className="mt-6 text-left max-w-lg mx-auto p-4 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-mono text-slate-600 space-y-2">
            <p className="font-bold text-slate-800 uppercase text-[9px] tracking-wide border-b border-slate-200 pb-1">Debug Diagnosis Panel</p>
            <p><span className="font-bold text-indigo-600">Offline Collection Counts:</span> {JSON.stringify(debugInfo.counts)}</p>
            {debugInfo.sampleDoc ? (
              <div>
                <p className="font-bold text-indigo-600 mt-1">Sample Doc from '{debugInfo.sampleDoc.collectionName}':</p>
                <pre className="mt-1 p-2 bg-slate-900 text-slate-100 rounded-lg overflow-auto max-h-40">{JSON.stringify(debugInfo.sampleDoc, null, 2)}</pre>
              </div>
            ) : (
              <p className="text-red-500 font-bold">No log-related collections found offline!</p>
            )}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white border-t border-slate-200 px-4 py-3 flex items-center justify-between text-xs shadow-inner">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            &lt; Prev
          </button>
          
          <span className="text-slate-500 font-medium">
            Page <span className="font-bold text-slate-800">{currentPage}</span> of <span className="font-bold text-slate-800">{totalPages}</span> · <span className="font-bold text-indigo-600">{filtered.length}</span> matches
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-all active:scale-[0.98]"
          >
            Next &gt;
          </button>
        </div>
      )}
    </div>
  )
}
