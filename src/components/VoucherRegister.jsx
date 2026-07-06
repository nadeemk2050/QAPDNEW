import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Clock, Wallet, Receipt, ArrowUpDown,
  ChevronLeft, ChevronRight, FileText, Filter, Download, Share2, X, Edit2, Trash2, ChevronDown
} from 'lucide-react'
import { deleteVoucher } from '../api'
import { getCurrentCompanyId, getDB } from '../localDB'
import { downloadVoucherPdf, shareVoucherPdf } from '../utils/voucherPdf'

const VOUCHER_CONFIG = {
  payment: { label: 'Payment Register', icon: Wallet, color: 'text-red-600', bg: 'bg-red-100', subType: 'out' },
  receipt: { label: 'Receipt Register', icon: Receipt, color: 'text-green-600', bg: 'bg-green-100', subType: 'in' },
  contra: { label: 'Contra Register', icon: ArrowUpDown, color: 'text-blue-600', bg: 'bg-blue-100', subType: 'contra' },
}

const getWeekRange = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // start on Monday
  const monday = new Date(d.setDate(diff))
  const sunday = new Date(d.setDate(diff + 6))
  const fmt = (date) => date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  return `${fmt(monday)} - ${fmt(sunday)} ${sunday.getFullYear()}`
}

const getMonthYear = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

const getQuarterYear = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  const q = Math.floor(d.getMonth() / 3) + 1
  return `Q${q} ${d.getFullYear()}`
}

const getYear = (dateStr) => {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return String(d.getFullYear())
}

const formatCurrency = (val) => {
  const num = Number(val || 0)
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

export default function VoucherRegister() {
  const { voucherType } = useParams()
  const navigate = useNavigate()
  const config = VOUCHER_CONFIG[voucherType] || VOUCHER_CONFIG.payment

  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState('')
  const [breakView, setBreakView] = useState('all') // 'all', 'daily', 'weekly', 'monthly', 'quarterly', 'annually'
  const [showBreakupSelector, setShowBreakupSelector] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedTx, setSelectedTx] = useState(null)
  const pageSize = 50

  useEffect(() => {
    loadTransactions()
  }, [voucherType])

  const loadTransactions = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const companyId = getCurrentCompanyId()
      if (!companyId) {
        setError('No company selected')
        return
      }

      const companyDB = await getDB()
      if (!companyDB?.offline_records) {
        setError('Database not ready')
        return
      }

      const ledgerDocs = await companyDB.offline_records.find({
        selector: { collectionName: { $in: ['parties', 'accounts', 'expenses', 'income_accounts', 'capital_accounts', 'asset_accounts', 'ledgers'] } }
      }).exec()
      const ledgerList = ledgerDocs.map(ld => {
        const r = ld.toJSON()
        const inner = r.data || {}
        return {
          id: r.id,
          name: inner.name || inner.accountName || ''
        }
      })

      const allPayments = await companyDB.offline_records.find({
        selector: { collectionName: 'payments' }
      }).exec()

      const txns = allPayments
        .map(d => d.toJSON())
        .filter(d => {
          const data = d.data || {}
          if (data.deleted || data.status === 'deleted' || data.isDeleted) return false
          // Filter by voucher type
          if (data.type !== config.subType) return false
          return true
        })
        .map(d => {
          const data = d.data || {}
          const subType = data.type || ''
          
          let drName = data.drName || ''
          let crName = data.crName || ''
          
          if (subType === 'out' || subType === 'payment') {
            drName = data.drName || data.partyName || (data.payments?.[0]?.ledgerName) || ''
            if (!drName) {
              const firstPaymentId = data.payments?.[0]?.ledgerId || data.partyId || data.expenseId || data.incomeAccountId
              drName = ledgerList.find(l => l.id === firstPaymentId)?.name || ''
            }
            crName = data.crName || data.accountName || ''
            if (!crName) {
              crName = ledgerList.find(l => l.id === data.accountId)?.name || ''
            }
          } else if (subType === 'in' || subType === 'receipt') {
            drName = data.drName || data.accountName || ''
            if (!drName) {
              drName = ledgerList.find(l => l.id === data.accountId)?.name || ''
            }
            crName = data.crName || data.partyName || (data.payments?.[0]?.ledgerName) || ''
            if (!crName) {
              const firstPaymentId = data.payments?.[0]?.ledgerId || data.partyId || data.expenseId || data.incomeAccountId
              crName = ledgerList.find(l => l.id === firstPaymentId)?.name || ''
            }
          } else if (subType === 'contra') {
            drName = data.toAccountName || data.drName || (data.splits && data.splits.length > 0 ? (data.splits[0].targetName || data.splits[0].name) : '') || (data.payments && data.payments.length > 0 ? (data.payments[0].ledgerName || data.payments[0].name) : '') || ''
            if (!drName) {
              const targetId = data.toAccountId || data.splits?.[0]?.targetId || data.splits?.[0]?.id || data.payments?.[0]?.ledgerId
              if (targetId) {
                drName = ledgerList.find(l => l.id === targetId)?.name || ''
              }
            }
            crName = data.accountName || data.crName || data.fromAccountName || ''
            if (!crName && (data.fromAccountId || data.accountId)) {
              crName = ledgerList.find(l => l.id === (data.fromAccountId || data.accountId))?.name || ''
            }
          }

          let resolvedPartyName = data.partyName || ''
          let resolvedAccountName = data.accountName || ''

          if (subType === 'contra') {
            resolvedPartyName = `${crName || '—'} → ${drName || '—'}`
          } else {
            resolvedPartyName = drName || crName || ''
            resolvedAccountName = crName || drName || ''
          }

          return {
            id: d.id,
            date: data.date || '',
            refNo: data.refNo || '',
            type: config.label,
            subType,
            amount: Number(data.totalAmount || data.amount || 0),
            narration: data.narration || '',
            partyName: resolvedPartyName,
            accountName: resolvedAccountName,
            accountId: data.accountId || data.toAccountId || '',
            drName,
            crName,
            collection: 'payments'
          }
        })
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

      setTransactions(txns)
    } catch (e) {
      console.warn('[QAPD] Failed to load register:', e)
      setError('Failed to load transactions')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const [drillDownYear, setDrillDownYear] = useState(null)
  const [drillDownQuarter, setDrillDownQuarter] = useState(null)
  const [drillDownMonth, setDrillDownMonth] = useState(null)
  const [drillDownDate, setDrillDownDate] = useState(null)
  const [drillDownWeekStart, setDrillDownWeekStart] = useState(null)

  // Scope transactions based on active hierarchical drill-down level
  const drillDownFilteredTxns = useMemo(() => {
    return transactions.filter(t => {
      if (!t.date) return false
      const d = new Date(t.date)
      if (isNaN(d.getTime())) return false

      if (drillDownYear !== null && d.getFullYear() !== drillDownYear) return false
      if (drillDownQuarter !== null) {
        const q = Math.floor(d.getMonth() / 3) + 1
        if (q !== drillDownQuarter) return false
      }
      if (drillDownMonth !== null && d.getMonth() !== drillDownMonth) return false
      if (drillDownDate !== null && t.date !== drillDownDate) return false
      if (drillDownWeekStart !== null) {
        const start = new Date(drillDownWeekStart)
        const end = new Date(start)
        end.setDate(end.getDate() + 6)
        const tDate = new Date(t.date)
        if (tDate < start || tDate > end) return false
      }

      return true
    })
  }, [transactions, drillDownYear, drillDownQuarter, drillDownMonth, drillDownDate, drillDownWeekStart])

  // Real-time search filter applied on top of the drill-down dataset
  const filteredTxns = useMemo(() => {
    if (!search.trim()) return drillDownFilteredTxns
    const q = search.toLowerCase().trim()
    return drillDownFilteredTxns.filter(t => {
      return (t.refNo || '').toLowerCase().includes(q) ||
             (t.narration || '').toLowerCase().includes(q) ||
             (t.partyName || '').toLowerCase().includes(q) ||
             (t.accountName || '').toLowerCase().includes(q) ||
             (t.drName || '').toLowerCase().includes(q) ||
             (t.crName || '').toLowerCase().includes(q) ||
             String(t.amount).includes(q) ||
             (t.date || '').includes(q)
    })
  }, [drillDownFilteredTxns, search])

  // Grouped Breakview calculations with drill-down payload attachment
  const groupedTxns = useMemo(() => {
    if (breakView === 'all') return []
    const groups = {}
    filteredTxns.forEach(t => {
      const d = new Date(t.date)
      let key = ''
      let drillDownData = {}

      if (breakView === 'daily') {
        key = formatDate(t.date)
        drillDownData = { date: t.date }
      } else if (breakView === 'weekly') {
        key = getWeekRange(t.date)
        const day = d.getDay()
        const diff = d.getDate() - day + (day === 0 ? -6 : 1)
        const monday = new Date(d.setDate(diff))
        const mondayStr = monday.toISOString().split('T')[0]
        drillDownData = { weekStart: mondayStr }
      } else if (breakView === 'monthly') {
        key = getMonthYear(t.date)
        drillDownData = { year: d.getFullYear(), month: d.getMonth() }
      } else if (breakView === 'quarterly') {
        key = getQuarterYear(t.date)
        drillDownData = { year: d.getFullYear(), quarter: Math.floor(d.getMonth() / 3) + 1 }
      } else if (breakView === 'annually') {
        key = getYear(t.date)
        drillDownData = { year: d.getFullYear() }
      }

      if (!groups[key]) {
        groups[key] = {
          title: key,
          transactions: [],
          totalAmount: 0,
          drillDownData
        }
      }
      groups[key].transactions.push(t)
      groups[key].totalAmount += t.amount
    })
    return Object.values(groups)
  }, [filteredTxns, breakView])

  // Active register state reporting to top layout bar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('quickaccpro-register-active', {
      detail: {
        accountName: config.label,
        vouchersCount: filteredTxns.length,
        search,
        refreshing,
        totalDebit: filteredTxns.reduce((s, t) => s + t.amount, 0),
        totalCredit: 0
      }
    }))
    return () => {
      window.dispatchEvent(new CustomEvent('quickaccpro-register-active', { detail: null }))
    }
  }, [filteredTxns.length, refreshing, search, config.label])

  // Event listeners for top bar controls
  useEffect(() => {
    const handleSearch = (e) => {
      setSearch(e.detail || '')
      setCurrentPage(1)
    }
    const handleRefresh = () => {
      loadTransactions(true)
    }
    window.addEventListener('quickaccpro-register-search', handleSearch)
    window.addEventListener('quickaccpro-register-refresh', handleRefresh)
    return () => {
      window.removeEventListener('quickaccpro-register-search', handleSearch)
      window.removeEventListener('quickaccpro-register-refresh', handleRefresh)
    }
  }, [voucherType])

  const handlePeriodClick = (row) => {
    const data = row.drillDownData || {}
    if (breakView === 'annually') {
      setDrillDownYear(data.year)
      setBreakView('quarterly')
    } else if (breakView === 'quarterly') {
      setDrillDownYear(data.year)
      setDrillDownQuarter(data.quarter)
      setBreakView('monthly')
    } else if (breakView === 'monthly') {
      setDrillDownYear(data.year)
      setDrillDownMonth(data.month)
      setBreakView('daily')
    } else if (breakView === 'daily') {
      setDrillDownDate(data.date)
      setBreakView('all')
    } else if (breakView === 'weekly') {
      setDrillDownWeekStart(data.weekStart)
      setBreakView('all')
    }
    setCurrentPage(1)
  }

  // Deletion logic
  const handleDeleteClick = async (tx) => {
    const pwd = prompt("Enter password to delete this voucher:")
    if (pwd === null) return
    if (pwd !== 'abcd') {
      alert("Incorrect password!")
      return
    }

    if (!window.confirm("Are you sure you want to permanently delete this voucher?")) {
      return
    }

    try {
      setLoading(false)
      await deleteVoucher(tx.id, tx.collection || 'payments')
      setSelectedTx(null)
      alert("Voucher deleted successfully!")
      loadTransactions()
    } catch (err) {
      alert(err.message || "Failed to delete voucher")
    }
  }

  // Pagination bounds
  const totalPages = Math.max(1, Math.ceil(
    (breakView === 'all' ? filteredTxns.length : groupedTxns.length) / pageSize
  ))
  const safePage = Math.min(currentPage, totalPages)
  const startIdx = (safePage - 1) * pageSize

  const pageTxns = useMemo(() => {
    if (breakView === 'all') {
      return filteredTxns.slice(startIdx, startIdx + pageSize)
    }
    return []
  }, [filteredTxns, breakView, startIdx])

  const pageGroups = useMemo(() => {
    if (breakView !== 'all') {
      return groupedTxns.slice(startIdx, startIdx + pageSize)
    }
    return []
  }, [groupedTxns, breakView, startIdx])

  const Icon = config.icon

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}>
                <Icon size={16} className={config.color} />
              </div>
              <h2 className="text-lg font-bold text-slate-800">{config.label}</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              All Vouchers · {filteredTxns.length} transactions
            </p>
          </div>
        </div>
        <button
          onClick={() => loadTransactions(true)}
          disabled={refreshing}
          className="btn-secondary text-xs"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center bg-slate-50 border-slate-200">
          <p className="text-[10px] font-bold text-slate-600 uppercase">Vouchers</p>
          <p className="text-xl font-black text-slate-800">{filteredTxns.length}</p>
        </div>
        <div className="card p-3 text-center bg-blue-50 border-blue-100">
          <p className="text-[10px] font-bold text-blue-600 uppercase">Total Amount</p>
          <p className="text-xl font-black text-slate-800">
            {formatCurrency(filteredTxns.reduce((s, t) => s + t.amount, 0))}
          </p>
        </div>
        <div className="card p-3 text-center bg-indigo-50 border-indigo-100">
          <p className="text-[10px] font-bold text-indigo-600 uppercase">Avg/Day</p>
          <p className="text-xl font-black text-slate-800">
            {formatCurrency(filteredTxns.length > 0 ? filteredTxns.reduce((s, t) => s + t.amount, 0) / (new Set(filteredTxns.map(t => t.date)).size || 1) : 0)}
          </p>
        </div>
      </div>

      {/* Table / List Controls */}
      <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {breakView === 'all' ? 'Detailed Transactions' : `${breakView} Summary`}
        </div>
        <div className="flex items-center gap-2">
          {/* Breakup Select Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowBreakupSelector(!showBreakupSelector)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1.5 active:scale-[0.98] shadow-sm select-none"
            >
              <span>{
                breakView === 'all' ? 'Detailed View' :
                breakView === 'daily' ? 'Daily View' :
                breakView === 'weekly' ? 'Weekly View' :
                breakView === 'monthly' ? 'Monthly View' :
                breakView === 'quarterly' ? 'Quarterly View' : 'Annual View'
              }</span>
              <ChevronDown size={14} />
            </button>
            {showBreakupSelector && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-slate-700">
                <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-black text-indigo-950 tracking-wider">
                  SELECT BREAKUP MODE
                </div>
                {[
                  { mode: 'all', title: 'DETAILED TRANSACTIONS', desc: 'All entries line by line' },
                  { mode: 'daily', title: 'DAILY BREAKUP SUMMARY', desc: 'Date, Debit, Credit, Value' },
                  { mode: 'weekly', title: 'WEEKLY BREAKUP SUMMARY', desc: 'Week-wise totals' },
                  { mode: 'monthly', title: 'MONTHLY BREAKUP SUMMARY', desc: 'Month-wise totals' },
                  { mode: 'quarterly', title: 'QUARTERLY BREAKUP SUMMARY', desc: 'Quarter-wise totals' },
                  { mode: 'annual', title: 'ANNUAL BREAKUP SUMMARY', desc: 'Year-wise totals' }
                ].map(item => (
                  <button
                    key={item.mode}
                    onClick={() => {
                      setDrillDownYear(null)
                      setDrillDownQuarter(null)
                      setDrillDownMonth(null)
                      setDrillDownDate(null)
                      setDrillDownWeekStart(null)
                      setBreakView(item.mode === 'annual' ? 'annually' : item.mode)
                      setShowBreakupSelector(false)
                      setCurrentPage(1)
                    }}
                    className={`w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors flex flex-col gap-0.5 ${breakView === item.mode ? 'bg-indigo-50 border-r-4 border-indigo-600' : ''}`}
                  >
                    <span className="text-[11px] font-extrabold text-slate-800">{item.title}</span>
                    <span className="text-[9px] text-slate-400 font-semibold">{item.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drill-down Breadcrumb / Active filters */}
      {(drillDownYear !== null || drillDownQuarter !== null || drillDownMonth !== null || drillDownDate !== null || drillDownWeekStart !== null) && (
        <div className="flex items-center gap-2 flex-wrap text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-medium">
          <span className="text-slate-400">Filtered:</span>
          {drillDownYear !== null && (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 flex items-center gap-1">
              {drillDownYear}
              <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => { setDrillDownYear(null); setDrillDownQuarter(null); setDrillDownMonth(null); }} />
            </span>
          )}
          {drillDownQuarter !== null && (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 flex items-center gap-1">
              Q{drillDownQuarter}
              <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => { setDrillDownQuarter(null); setDrillDownMonth(null); }} />
            </span>
          )}
          {drillDownMonth !== null && (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 flex items-center gap-1">
              {new Date(2026, drillDownMonth, 1).toLocaleDateString('en-IN', { month: 'short' })}
              <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => setDrillDownMonth(null)} />
            </span>
          )}
          {drillDownDate !== null && (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 flex items-center gap-1">
              {formatDate(drillDownDate)}
              <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => setDrillDownDate(null)} />
            </span>
          )}
          {drillDownWeekStart !== null && (
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 flex items-center gap-1">
              Week of {formatDate(drillDownWeekStart)}
              <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => setDrillDownWeekStart(null)} />
            </span>
          )}
          <button
            onClick={() => {
              setDrillDownYear(null)
              setDrillDownQuarter(null)
              setDrillDownMonth(null)
              setDrillDownDate(null)
              setDrillDownWeekStart(null)
            }}
            className="text-red-650 hover:text-red-800 font-bold ml-auto"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 bg-red-50 border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center py-12">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 mt-3">Loading register...</p>
        </div>
      ) : (breakView === 'all' ? pageTxns.length === 0 : pageGroups.length === 0) ? (
        <div className="text-center py-12 text-slate-400">
          <FileText size={36} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No vouchers found</p>
          <p className="text-xs mt-1">Create a voucher to see it here</p>
        </div>
      ) : (
        <>
          {/* Detailed / Normal List */}
          {breakView === 'all' && (
            <div className="space-y-2">
              {pageTxns.map(tx => (
                <div
                  key={tx.id}
                  onClick={() => setSelectedTx(tx)}
                  className="card p-3 hover:shadow-md transition-shadow cursor-pointer border border-slate-100 bg-white space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        voucherType === 'payment' ? 'bg-red-100 text-red-700' :
                        voucherType === 'receipt' ? 'bg-green-100 text-green-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{config.label}</span>
                      <span className="text-[11px] font-mono text-slate-500">{tx.refNo}</span>
                    </div>
                    <span className={`text-sm font-bold font-mono ${
                      voucherType === 'payment' ? 'text-red-600' :
                      voucherType === 'receipt' ? 'text-green-600' :
                      'text-blue-600'
                    }`}>
                      {voucherType === 'payment' ? '−' : voucherType === 'receipt' ? '+' : ''}
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Clock size={11} />{formatDate(tx.date)}</span>
                    {tx.partyName && <span>· {tx.partyName}</span>}
                    {tx.accountName && <span>· {tx.accountName}</span>}
                  </div>
                  {tx.narration && (
                    <p className="text-xs text-slate-400 mt-1 italic truncate">{tx.narration}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Grouped Breakviews Table */}
          {breakView !== 'all' && (
            <div className="card overflow-x-auto p-0 border border-slate-200 shadow-sm bg-white rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white border-b border-slate-700 text-[10px] font-bold uppercase tracking-wider select-none">
                    <th className="p-3">PERIOD</th>
                    <th className="p-3 text-center">VOUCHERS</th>
                    <th className="p-3 text-right">DEBIT (DHS)</th>
                    <th className="p-3 text-right">CREDIT (DHS)</th>
                    <th className="p-3 text-right">TOTAL AMOUNT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  <tr className="bg-slate-100 font-bold border-b border-slate-200">
                    <td className="p-3 text-slate-800 font-extrabold text-[10px] uppercase tracking-wider">CURRENT TOTALS:</td>
                    <td className="p-3 text-center text-slate-600">({filteredTxns.length} Vch)</td>
                    <td className="p-3 text-right text-green-700 font-mono text-[11px] whitespace-nowrap">
                      {formatCurrency(filteredTxns.reduce((sum, t) => sum + (t.subType === 'in' || t.subType === 'receipt' || t.subType === 'contra' ? t.amount : 0), 0))}
                    </td>
                    <td className="p-3 text-right text-red-600 font-mono text-[11px] whitespace-nowrap">
                      {formatCurrency(filteredTxns.reduce((sum, t) => sum + (t.subType === 'out' || t.subType === 'payment' || t.subType === 'contra' ? t.amount : 0), 0))}
                    </td>
                    <td className="p-3 text-right text-slate-800 font-mono text-[11px] whitespace-nowrap">
                      {formatCurrency(filteredTxns.reduce((sum, t) => sum + t.amount, 0))}
                    </td>
                  </tr>
                  {pageGroups.map((group, i) => {
                    const groupDebit = group.transactions.reduce((sum, t) => sum + (t.subType === 'in' || t.subType === 'receipt' || t.subType === 'contra' ? t.amount : 0), 0)
                    const groupCredit = group.transactions.reduce((sum, t) => sum + (t.subType === 'out' || t.subType === 'payment' || t.subType === 'contra' ? t.amount : 0), 0)
                    return (
                      <tr
                        key={i}
                        onClick={() => handlePeriodClick(group)}
                        className="hover:bg-slate-50/80 border-b border-slate-100 cursor-pointer active:bg-slate-100/50 transition-colors"
                      >
                        <td className="p-3 text-indigo-700 font-bold uppercase">{group.title}</td>
                        <td className="p-3 text-center text-slate-500">({group.transactions.length} Vch)</td>
                        <td className="p-3 text-right text-green-700 font-mono">
                          {groupDebit > 0 ? formatCurrency(groupDebit) : '0.00'}
                        </td>
                        <td className="p-3 text-right text-red-600 font-mono">
                          {groupCredit > 0 ? formatCurrency(groupCredit) : '0.00'}
                        </td>
                        <td className="p-3 text-right text-slate-800 font-mono">
                          {formatCurrency(group.totalAmount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 pb-4">
              <p className="text-xs text-slate-500">
                Page {safePage} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-medium text-slate-600 px-2">
                  {safePage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                  Transaction Detail
                </span>
                <h3 className="text-sm font-black text-slate-800 uppercase mt-0.5">
                  Ref: {selectedTx.refNo || '—'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTx(null)}
                className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Date</p>
                  <p className="font-mono text-slate-700 font-bold mt-0.5">{formatDate(selectedTx.date)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Vch Type</p>
                  <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold mt-1 uppercase ${
                    voucherType === 'payment' ? 'bg-red-100 text-red-700' :
                    voucherType === 'receipt' ? 'bg-green-100 text-green-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {config.label}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start justify-between border-b border-slate-50 pb-2">
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Source (Credit)</p>
                    <p className="font-bold text-red-600 uppercase text-[11px]">{selectedTx.crName || selectedTx.accountName || '—'}</p>
                  </div>
                  <span className="text-slate-300 font-bold mt-2">➔</span>
                  <div className="space-y-0.5 text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Receiver (Debit)</p>
                    <p className="font-bold text-green-700 uppercase text-[11px]">{selectedTx.drName || selectedTx.partyName || '—'}</p>
                  </div>
                </div>

                <div className="border-b border-slate-50 pb-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Voucher Amount</p>
                  <p className="font-mono text-sm font-bold text-slate-800 mt-0.5">
                    {formatCurrency(selectedTx.amount)} DHS
                  </p>
                </div>

                {selectedTx.narration && (
                  <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Narration / Description</p>
                    <p className="text-slate-600 italic font-medium mt-1 leading-relaxed">{selectedTx.narration}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => { downloadVoucherPdf(selectedTx); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                <Download size={12} />
                PDF
              </button>
              <button
                onClick={() => { shareVoucherPdf(selectedTx); }}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-xl text-xs transition-colors"
              >
                <Share2 size={12} />
                Share
              </button>
              <button
                onClick={() => { navigate('/voucher/edit/' + selectedTx.id); setSelectedTx(null); }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteClick(selectedTx)}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
