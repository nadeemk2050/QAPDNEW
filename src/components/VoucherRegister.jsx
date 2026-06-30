import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Clock, Wallet, Receipt, ArrowUpDown,
  ChevronLeft, ChevronRight, FileText, Filter
} from 'lucide-react'
import { getCurrentCompanyId, getDB } from '../localDB'

const VOUCHER_CONFIG = {
  payment: { label: 'Payment Register', icon: Wallet, color: 'text-red-600', bg: 'bg-red-100', subType: 'out' },
  receipt: { label: 'Receipt Register', icon: Receipt, color: 'text-green-600', bg: 'bg-green-100', subType: 'in' },
  contra: { label: 'Contra Register', icon: ArrowUpDown, color: 'text-blue-600', bg: 'bg-blue-100', subType: 'contra' },
}

const getDaysAgoStr = (days) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

      const tenDaysAgo = getDaysAgoStr(10)

      const allPayments = await companyDB.offline_records.find({
        selector: { collectionName: 'payments' }
      }).exec()

      const txns = allPayments
        .map(d => d.toJSON())
        .filter(d => {
          const data = d.data || {}
          if (data.deleted || data.status === 'deleted') return false
          // Filter by voucher type
          if (data.type !== config.subType) return false
          // Filter by last 10 days
          if (!data.date || data.date < tenDaysAgo) return false
          return true
        })
        .map(d => {
          const data = d.data || {}
          return {
            id: d.id,
            date: data.date || '',
            refNo: data.refNo || '',
            type: config.label,
            subType: data.type || '',
            amount: Number(data.totalAmount || data.amount || 0),
            narration: data.narration || '',
            partyName: data.partyName || (data.payments?.[0]?.ledgerName) || '',
            accountName: data.accountName || data.toAccountName || '',
            accountId: data.accountId || data.toAccountId || '',
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

  const totalPages = Math.max(1, Math.ceil(transactions.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIdx = (safePage - 1) * pageSize
  const pageTxns = transactions.slice(startIdx, startIdx + pageSize)
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
              Last 10 days · {transactions.length} transactions
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
          <p className="text-xl font-black text-slate-800">{transactions.length}</p>
        </div>
        <div className="card p-3 text-center bg-blue-50 border-blue-100">
          <p className="text-[10px] font-bold text-blue-600 uppercase">Total Amount</p>
          <p className="text-xl font-black text-blue-800">
            {formatCurrency(transactions.reduce((s, t) => s + t.amount, 0))}
          </p>
        </div>
        <div className="card p-3 text-center bg-indigo-50 border-indigo-100">
          <p className="text-[10px] font-bold text-indigo-600 uppercase">Avg/Day</p>
          <p className="text-xl font-black text-indigo-800">
            {formatCurrency(transactions.length > 0 ? transactions.reduce((s, t) => s + t.amount, 0) / Math.min(10, transactions.length) : 0)}
          </p>
        </div>
      </div>

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
      ) : pageTxns.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <FileText size={36} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No {voucherType} vouchers found in last 10 days</p>
          <p className="text-xs mt-1">Create a {voucherType} voucher to see it here</p>
        </div>
      ) : (
        <>
          {/* Transactions List */}
          <div className="space-y-2">
            {pageTxns.map(tx => (
              <div
                key={tx.id}
                className="card p-3 border-l-4 border-l-indigo-400 hover:shadow-md transition-shadow"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 pb-4">
              <p className="text-xs text-slate-500">
                Showing {startIdx + 1}–{Math.min(startIdx + pageSize, transactions.length)} of {transactions.length}
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
    </div>
  )
}
