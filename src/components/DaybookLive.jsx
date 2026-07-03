import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { 
  BookOpen, RefreshCw, Search, Filter, ArrowUpDown, 
  Receipt, Wallet, Notebook, AlertCircle, Clock, 
  ChevronDown, ChevronUp, FileText, ChevronLeft, ChevronRight, Download, Share2, X
} from 'lucide-react'
import { downloadVoucherPdf, shareVoucherPdf, shareVoucherText } from '../utils/voucherPdf'
import { getDaybookAll, getAccountLedger, listContra, listAccounts, listLedgers, deleteVoucher } from '../api'

const TYPE_CONFIG = {
  invoices: { label: 'Invoice', icon: Receipt, color: 'text-blue-600', bg: 'bg-blue-100' },
  payments: { label: 'Payment', icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  journal_vouchers: { label: 'Journal', icon: Notebook, color: 'text-purple-600', bg: 'bg-purple-100' },
}

const getTodayStr = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getYesterdayStr = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDaysAgoStr = (days) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function DaybookLive({ subUser }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const registerType = searchParams.get('register') // 'payment', 'receipt', 'contra', or null
  const filterAccountName = searchParams.get('accountName') // Specific Cash/Bank account name if provided

  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTx, setSelectedTx] = useState(null)
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)

  // Date filters state
  const todayStr = getTodayStr()
  const yesterdayStr = getYesterdayStr()
  const [dateMode, setDateMode] = useState('all') // Default to all transactions
  const [filterDate, setFilterDate] = useState(todayStr)
  const [filterMonth, setFilterMonth] = useState(todayStr.substring(0, 7))
  const [startDate, setStartDate] = useState(yesterdayStr) // Default start range to yesterday
  const [endDate, setEndDate] = useState(todayStr)

  const [breakupMode, setBreakupMode] = useState('detailed') // 'detailed', 'daily', 'weekly', 'monthly', 'quarterly', 'annual'
  const [showBreakupSelector, setShowBreakupSelector] = useState(false)

  const pageSize = (filterAccountName && dateMode === 'all') ? 40 : 50


  const handlePrevDate = () => {
    if (!filterDate) return
    const d = new Date(filterDate)
    if (isNaN(d.getTime())) return
    d.setDate(d.getDate() - 1)
    setFilterDate(d.toISOString().split('T')[0])
  }

  const handleNextDate = () => {
    if (!filterDate) return
    const d = new Date(filterDate)
    if (isNaN(d.getTime())) return
    d.setDate(d.getDate() + 1)
    setFilterDate(d.toISOString().split('T')[0])
  }

  const handlePrevMonth = () => {
    if (!filterMonth) return
    const [y, m] = filterMonth.split('-').map(Number)
    const prevDate = new Date(y, m - 2, 1)
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
    setFilterMonth(prevMonthStr)
  }

  const handleNextMonth = () => {
    if (!filterMonth) return
    const [y, m] = filterMonth.split('-').map(Number)
    const nextDate = new Date(y, m, 1)
    const nextMonthStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
    setFilterMonth(nextMonthStr)
  }

  const downloadCSV = () => {
    try {
      const headers = ["Date", "Vch Type", "Particulars", "Ref", "Debit (DHS)", "Credit (DHS)", "Value"]
      const rows = filtered.map(t => [
        t.date || '',
        t.type || '',
        getParticulars(t) || '',
        t.refNo || '',
        t.debit ? t.debit.toFixed(2) : '',
        t.credit ? t.credit.toFixed(2) : '',
        t.runningBalance ? t.runningBalance.toFixed(2) : ''
      ])

      const csvContent = [
        headers.join(','),
        ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
      ].join("\n")

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.setAttribute("href", url)
      link.setAttribute("download", `${filterAccountName || 'Daybook'}_${dateMode}_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (e) {
      console.error("CSV download failed", e)
      alert("Failed to export CSV.")
    }
  }

  const downloadPDF = () => {
    const printWindow = window.open('', '_blank')
    const title = filterAccountName ? `${filterAccountName} Register` : 'Daybook Live'
    
    const sorted = [...filtered]
    
    let rowsHtml = sorted.map(t => {
      let vchLabel = (t.type || '').toUpperCase()
      if (t.type === 'payments') {
        if (t.subType === 'in' || t.subType === 'receipt') vchLabel = 'RECEIPT'
        else if (t.subType === 'out' || t.subType === 'payment') vchLabel = 'PAYMENT'
        else if (t.subType?.toLowerCase() === 'contra') vchLabel = 'CONTRA'
      } else if (t.type === 'journal_vouchers') {
        vchLabel = 'JOURNAL'
      }

      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 8px; font-family: monospace;">${formatDate(t.date)}</td>
          <td style="padding: 10px 8px; font-weight: bold; color: #4f46e5;">${vchLabel}</td>
          <td style="padding: 10px 8px; text-transform: uppercase;">${getParticulars(t) || ''}</td>
          <td style="padding: 10px 8px; font-family: monospace;">${t.refNo || ''}</td>
          <td style="padding: 10px 8px; text-align: right; font-family: monospace; color: #15803d; font-weight: bold;">${t.debit ? formatCurrency(t.debit) : ''}</td>
          <td style="padding: 10px 8px; text-align: right; font-family: monospace; color: #b91c1c; font-weight: bold;">${t.credit ? formatCurrency(t.credit) : ''}</td>
          <td style="padding: 10px 8px; text-align: right; font-family: monospace; font-weight: bold; background-color: #f8fafc;">${formatCurrency(t.runningBalance)}</td>
        </tr>
      `
    }).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; color: #1e293b; padding: 30px; }
            header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }
            h1 { font-size: 24px; margin: 0; text-transform: uppercase; letter-spacing: -0.5px; }
            .meta { font-size: 11px; color: #64748b; margin-top: 5px; }
            .totals-box { display: flex; gap: 15px; }
            .total-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; text-align: right; }
            .total-card-title { font-size: 8px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
            .total-card-val { font-size: 13px; font-weight: bold; font-family: monospace; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th { background-color: #0f172a; color: white; padding: 10px 8px; text-align: left; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; font-size: 9px; }
            tr:nth-child(even) { background-color: #f8fafc; }
            @media print {
              body { padding: 0; }
              @page { margin: 1.5cm; }
            }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>${title}</h1>
              <div class="meta">Generated: ${new Date().toLocaleDateString('en-IN')} | Period: ${dateMode.toUpperCase()}</div>
            </div>
            <div class="totals-box">
              <div class="total-card">
                <div class="total-card-title">Total Vch</div>
                <div class="total-card-val">${filtered.length}</div>
              </div>
              <div class="total-card">
                <div class="total-card-title">Closing Balance</div>
                <div class="total-card-val" style="color: ${accountCurrentBalance >= 0 ? '#15803d' : '#b91c1c'}">
                  DHS ${formatCurrency(Math.abs(accountCurrentBalance || 0))} ${accountCurrentBalance >= 0 ? 'Dr' : 'Cr'}
                </div>
              </div>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th style="width: 100px;">Date</th>
                <th style="width: 80px;">Type</th>
                <th>Particulars</th>
                <th style="width: 100px;">Ref</th>
                <th style="text-align: right; width: 110px;">Debit (DHS)</th>
                <th style="text-align: right; width: 110px;">Credit (DHS)</th>
                <th style="text-align: right; width: 130px;">Balance (DHS)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }


  useEffect(() => {
    setDateMode('all')
    setBreakupMode('detailed')
  }, [filterAccountName])

  useEffect(() => {
    loadData()
  }, [filterAccountName, dateMode, filterDate, filterMonth, startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lightweight background refresh every 2 minutes (instead of every 6 seconds)
  // Only refreshes transaction data — does NOT re-fetch accounts/ledgers each time
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !refreshing && !loading) {
        quietRefreshTransactions()
      }
    }, 120000) // 2 minutes
    return () => clearInterval(timer)
  }, [filterAccountName, refreshing, loading])

  // Listen for cloud sync flush events — triggers instant refresh when ACCPRO
  // creates/updates/deletes vouchers in the cloud
  useEffect(() => {
    const handleCloudSyncFlush = () => {
      if (!refreshing && !loading) {
        quietRefreshTransactions()
      }
    }
    window.addEventListener('qapd-cloud-sync-flush', handleCloudSyncFlush)
    return () => window.removeEventListener('qapd-cloud-sync-flush', handleCloudSyncFlush)
  }, [filterAccountName, refreshing, loading])


  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, filterType, dateMode, filterDate, filterMonth, startDate, endDate, breakupMode])

  // Listen to filter events from Layout top header bar
  useEffect(() => {
    const handleSetFilter = (e) => setDateMode(e.detail)
    const handleDateFilter = (e) => {
      const { type, value } = e.detail
      if (type === 'filterDate') setFilterDate(value)
      if (type === 'startDate') setStartDate(value)
      if (type === 'endDate') setEndDate(value)
      if (type === 'filterMonth') setFilterMonth(value)
    }
    const handleSearch = (e) => setSearch(e.detail)

    window.addEventListener('quickaccpro-register-filter-set', handleSetFilter)
    window.addEventListener('quickaccpro-register-filter-date', handleDateFilter)
    window.addEventListener('quickaccpro-register-search', handleSearch)

    return () => {
      window.removeEventListener('quickaccpro-register-filter-set', handleSetFilter)
      window.removeEventListener('quickaccpro-register-filter-date', handleDateFilter)
      window.removeEventListener('quickaccpro-register-search', handleSearch)
    }
  }, [])

  useEffect(() => {
    const handleStepFilter = (e) => {
      if (e.detail === 'prev') {
        handlePrevDate()
      } else {
        handleNextDate()
      }
    }
    window.addEventListener('quickaccpro-register-filter-step', handleStepFilter)
    return () => window.removeEventListener('quickaccpro-register-filter-step', handleStepFilter)
  }, [filterDate])

  useEffect(() => {
    const handleStepMonthFilter = (e) => {
      if (e.detail === 'prev') {
        handlePrevMonth()
      } else {
        handleNextMonth()
      }
    }
    window.addEventListener('quickaccpro-register-filter-month-step', handleStepMonthFilter)
    return () => window.removeEventListener('quickaccpro-register-filter-month-step', handleStepMonthFilter)
  }, [filterMonth])


  // ─── Shared function: fetch transactions from API ───
  // Extracted so both loadData and quietRefreshTransactions use the same logic
  const fetchTransactions = async () => {
    let allTransactions = []

    // Calculate dates based on dateMode
    let start = null
    let end = null
    const today = getTodayStr()

    if (dateMode === 'all') {
      start = null
      end = null
    } else if (dateMode === 'single') {
      start = filterDate
      end = filterDate
    } else if (dateMode === 'custom') {
      start = startDate
      end = endDate
    } else if (dateMode === 'month') {
      start = `${filterMonth}-01`
      const [year, month] = filterMonth.split('-').map(Number)
      const lastDay = new Date(year, month, 0).getDate()
      end = `${filterMonth}-${String(lastDay).padStart(2, '0')}`
    }

    if (filterAccountName) {
      // Account-specific ledger: fetch from ALL parallel sources for 100% coverage
      const promises = [
        getAccountLedger(filterAccountName, start, end).catch(e => { console.warn('AccountLedger failed', e); return {}; }),
        listContra(start, end).catch(e => { console.warn('listContra failed', e); return {}; }),
        getDaybookAll(start, end).catch(e => { console.warn('DaybookAll failed', e); return {}; }),
      ]
      const [accLedgerData, contraData, allDaybookData] = await Promise.all(promises)

      const txMap = new Map()
      const addToMap = (list) => {
        (list || []).forEach(t => {
          if (t.id) txMap.set(t.id, t)
        })
      }
      addToMap(accLedgerData.transactions)
      addToMap(contraData.transactions)
      if (allDaybookData?.transactions) addToMap(allDaybookData.transactions)

      allTransactions = Array.from(txMap.values())
    } else {
      const data = await getDaybookAll(start, end).catch(e => { console.warn('DaybookAll failed', e); return {}; })
      allTransactions = data.transactions || []
    }

    return allTransactions
  }

  // Lightweight background refresh — fetches ONLY transactions, no accounts/ledgers
  const quietRefreshTransactions = async () => {
    try {
      const allTransactions = await fetchTransactions()
      const cacheKey = 'quickaccpro_cached_transactions'

      allTransactions.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '')
        if (dateCmp !== 0) return dateCmp
        return (b.syncTimestamp || 0) - (a.syncTimestamp || 0)
      })

      setTransactions(allTransactions)
      localStorage.setItem(cacheKey, JSON.stringify(allTransactions))
    } catch (err) {
      console.warn("Background refresh failed", err)
    }
  }

  const loadData = async () => {
    const cacheKey = 'quickaccpro_cached_transactions'
    const cachedRaw = localStorage.getItem(cacheKey)
    let hasCache = false

    // For account-specific views, always fetch fresh data (don't use cache)
    if (cachedRaw && !filterAccountName) {
      try {
        const cached = JSON.parse(cachedRaw)
        // Filter cache by the current dateMode boundaries so we don't display out-of-range items on load
        let filteredCached = cached
        let start = null
        let end = null
        const today = getTodayStr()
        if (dateMode === 'all') {
          start = null
          end = null
        } else if (dateMode === 'single') {
          start = filterDate
          end = filterDate
        } else if (dateMode === 'custom') {
          start = startDate
          end = endDate
        } else if (dateMode === 'month') {
          start = `${filterMonth}-01`
          const [year, month] = filterMonth.split('-').map(Number)
          const lastDay = new Date(year, month, 0).getDate()
          end = `${filterMonth}-${String(lastDay).padStart(2, '0')}`
        }

        if (start || end) {
          filteredCached = cached.filter(t => {
            if (start && t.date < start) return false
            if (end && t.date > end) return false
            return true
          })
        }

        setTransactions(filteredCached)
        setLoading(false)
        hasCache = true
      } catch (e) {}
    }

    if (!hasCache) {
      setLoading(true)
    }
    setError('')
    setCurrentPage(1)
    
    try {
      // ─── Fetch from ALL available sources for 100% coverage ───
      const allTransactions = await fetchTransactions()

      // ─── Refresh accounts/ledgers cache ONLY if not already cached ───
      try {
        const existingAccounts = localStorage.getItem('quickaccpro_cached_accounts')
        const existingLedgers = localStorage.getItem('quickaccpro_cached_ledgers')
        if (!existingAccounts || !existingLedgers) {
          const [accData, ledData] = await Promise.all([
            listAccounts().catch(e => { console.error(e); return {}; }),
            listLedgers().catch(e => { console.error(e); return {}; }),
          ])
          if (accData.accounts) {
            localStorage.setItem('quickaccpro_cached_accounts', JSON.stringify(accData.accounts))
          }
          if (ledData.ledgers) {
            localStorage.setItem('quickaccpro_cached_ledgers', JSON.stringify(ledData.ledgers))
          }
        }
      } catch (e) {}

      allTransactions.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '')
        if (dateCmp !== 0) return dateCmp
        return (b.syncTimestamp || 0) - (a.syncTimestamp || 0)
      })

      setTransactions(allTransactions)
      localStorage.setItem(cacheKey, JSON.stringify(allTransactions))
    } catch (err) {
      if (!hasCache) {
        setError(err.message || 'Failed to load daybook')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVoucher = async (tx) => {
    const pwd = prompt("Enter password to delete this voucher:")
    if (pwd === null) return
    if (pwd !== 'abcd') {
      alert("Incorrect password!")
      return
    }

    if (!window.confirm("Are you sure you want to permanently delete this voucher? This will revert all associated accounts and ledger balances.")) {
      return
    }

    try {
      setLoading(true)
      await deleteVoucher(tx.id, pwd, subUser?.id, subUser?.name)

      // Update cache in local storage first!
      try {
        const cacheKey = 'quickaccpro_cached_transactions'
        const cachedRaw = localStorage.getItem(cacheKey)
        if (cachedRaw) {
          let cached = JSON.parse(cachedRaw)
          // Find the deleted transaction to get its refNo and accountId for sibling deletion
          const targetTx = cached.find(t => t.id === tx.id)
          if (targetTx) {
            // Remove the deleted transaction and any siblings (sharing same refNo, accountId, and type/subType)
            cached = cached.filter(t => {
              if (t.id === tx.id) return false
              if (targetTx.type === 'payments' && targetTx.subType !== 'contra' && targetTx.refNo) {
                // Sibling check
                return !(t.type === 'payments' && t.refNo === targetTx.refNo && t.accountId === targetTx.accountId && t.subType === targetTx.subType)
              }
              return true
            })
            localStorage.setItem(cacheKey, JSON.stringify(cached))
          }
        }
      } catch (e) {
        console.error("Failed to update cache on deletion:", e)
      }

      alert("Voucher deleted successfully!")
      loadData()
    } catch (err) {
      alert(err.message || "Failed to delete voucher")
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setCurrentPage(1)
    const cacheKey = 'quickaccpro_cached_transactions'

    try {
      const allTransactions = await fetchTransactions()

      // ─── Also refresh accounts/ledgers cache ───
      const [accData, ledData] = await Promise.all([
        listAccounts().catch(e => { console.error(e); return {}; }),
        listLedgers().catch(e => { console.error(e); return {}; }),
      ])
      try {
        if (accData.accounts) {
          localStorage.setItem('quickaccpro_cached_accounts', JSON.stringify(accData.accounts))
        }
        if (ledData.ledgers) {
          localStorage.setItem('quickaccpro_cached_ledgers', JSON.stringify(ledData.ledgers))
        }
      } catch (e) {}

      allTransactions.sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '')
        if (dateCmp !== 0) return dateCmp
        return (b.syncTimestamp || 0) - (a.syncTimestamp || 0)
      })

      setTransactions(allTransactions)
      localStorage.setItem(cacheKey, JSON.stringify(allTransactions))
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const formatCurrency = (val, decimals = 2) => {
    const num = Number(val || 0)
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return dateStr }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  // Fetch opening balance of the account
  const getAccountOpeningBalance = () => {
    if (!filterAccountName) return 0
    try {
      const cachedAccountsRaw = localStorage.getItem('quickaccpro_cached_accounts')
      if (cachedAccountsRaw) {
        const accounts = JSON.parse(cachedAccountsRaw)
        const matched = accounts.find(a => (a.name || '').toLowerCase() === filterAccountName.toLowerCase())
        if (matched) return Number(matched.openingBalance || 0)
      }
    } catch (e) {}
    try {
      const cachedLedgersRaw = localStorage.getItem('quickaccpro_cached_ledgers')
      if (cachedLedgersRaw) {
        const ledgers = JSON.parse(cachedLedgersRaw)
        const matched = ledgers.find(l => (l.name || '').toLowerCase() === filterAccountName.toLowerCase())
        if (matched) return Number(matched.openingBalance || 0)
      }
    } catch (e) {}
    return 0
  }
  const accountOpeningBalance = getAccountOpeningBalance()

  // Dynamic balance and particulars mapping helper
  const getParticulars = (t) => {
    if (t.type === 'payments') {
      const payer = t.crName || t.accountName || '—'
      const receiver = t.drName || t.partyName || '—'
      return `${payer} ➔ ${receiver}`
    }
    if (t.type === 'journal_vouchers') {
      return `${t.drName || '—'} / ${t.crName || '—'}`
    }
    return t.description || t.partyName || 'Transaction'
  }

  const getEnrichedTransactions = () => {
    // 1. Filter only by accountName first (do not filter by date/type yet)
    let accountTxns = transactions.filter(t => {
      if (filterAccountName) {
        const nameLower = filterAccountName.trim().toLowerCase()
        return (t.accountName || '').trim().toLowerCase() === nameLower ||
               (t.drName || '').trim().toLowerCase() === nameLower ||
               (t.crName || '').trim().toLowerCase() === nameLower ||
               (t.partyName || '').trim().toLowerCase() === nameLower ||
               (t.description || '').toLowerCase().includes(nameLower) ||
               (t.drName || '').toLowerCase().split(', ').map(n => n.trim().toLowerCase()).includes(nameLower) ||
               (t.crName || '').toLowerCase().split(', ').map(n => n.trim().toLowerCase()).includes(nameLower)
      }
      return true
    })

    // 2. Sort chronologically (oldest first) to compute running balance
    accountTxns.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    let runningVal = accountOpeningBalance
    const enrichedAll = accountTxns.map(t => {
      let isDr = false
      let isCr = false
      let amt = Number(t.amount || 0)

      if (filterAccountName) {
        const nameLower = filterAccountName.toLowerCase()
        const isAccountNameMatch = (t.accountName || '').toLowerCase() === nameLower
        const isDrMatch = (t.drName || '').toLowerCase() === nameLower || 
                          (t.drName || '').toLowerCase().split(', ').map(n => n.trim()).includes(nameLower)
        const isCrMatch = (t.crName || '').toLowerCase() === nameLower || 
                          (t.crName || '').toLowerCase().split(', ').map(n => n.trim()).includes(nameLower)

        if (t.type === 'payments' && isAccountNameMatch) {
          if (t.subType === 'in' || t.subType === 'receipt') {
            isDr = true
          } else if (t.subType === 'out' || t.subType === 'payment') {
            isCr = true
          } else if (t.subType?.toLowerCase() === 'contra') {
            if (isDrMatch && !isCrMatch) {
              isDr = true
            } else {
              isCr = true
            }
          }
        } else if (isDrMatch) {
          isDr = true
          if (t.isMulti && t.splits) {
            const matchedSplit = t.splits.find(s => (s.targetName || '').toLowerCase() === nameLower)
            if (matchedSplit) {
              amt = Number(matchedSplit.amount || 0)
            }
          }
        } else if (isCrMatch) {
          isCr = true
          if (t.isMulti && t.splits && t.type === 'journal_vouchers') {
            const matchedSplit = t.splits.find(s => (s.targetName || '').toLowerCase() === nameLower && s.type === 'cr')
            if (matchedSplit) {
              amt = Number(matchedSplit.amount || 0)
            }
          }
        } else if (isAccountNameMatch) {
          isDr = true
        }
      } else {
        if (t.type === 'payments') {
          const subTypeLower = (t.subType || '').toLowerCase()
          if (subTypeLower === 'in' || subTypeLower === 'receipt') {
            isDr = true
          } else if (subTypeLower === 'out' || subTypeLower === 'payment') {
            isCr = true
          } else if (subTypeLower === 'contra') {
            isCr = true
          }
        } else if (t.type === 'journal_vouchers') {
          isDr = true
        }
      }

      if (isDr) runningVal += amt
      if (isCr) runningVal -= amt

      return {
        ...t,
        debit: isDr ? amt : 0,
        credit: isCr ? amt : 0,
        runningBalance: runningVal
      }
    })

    // 3. Now apply the date and type and search filters to enrichedAll to get the list to display in the UI
    let list = enrichedAll.filter(t => {
      // Date-wise filtering
      if (dateMode === 'all') {
        // No date filtering — show all
      } else if (dateMode === 'single') {
        if (t.date !== filterDate) return false
      } else if (dateMode === 'custom') {
        if (!t.date || t.date < startDate || t.date > endDate) return false
      } else if (dateMode === 'month') {
        if (!t.date || !t.date.startsWith(filterMonth)) return false
      }

      if (!filterAccountName) {
        if (registerType === 'payment') {
          if (t.type !== 'payments' || t.subType !== 'out') return false
        } else if (registerType === 'receipt') {
          if (t.type !== 'payments' || (t.subType !== 'in' && t.subType !== 'receipt')) return false
        } else if (registerType === 'contra') {
          if (t.type !== 'payments' || t.subType?.toLowerCase() !== 'contra') return false
        } else {
          if (filterType !== 'all') {
            if (filterType === 'payments') {
              if (t.type !== 'payments' || (t.subType !== 'out' && t.subType !== 'payment')) return false
            } else if (filterType === 'receipts') {
              if (t.type !== 'payments' || (t.subType !== 'in' && t.subType !== 'receipt')) return false
            } else if (filterType === 'contra') {
              if (t.type !== 'payments' || t.subType?.toLowerCase() !== 'contra') return false
            } else {
              if (t.type !== filterType) return false
            }
          }
        }
      }

      if (!search) return true
      const q = search.toLowerCase()
      return (t.refNo || '').toLowerCase().includes(q) ||
             (t.description || '').toLowerCase().includes(q) ||
             (t.partyName || '').toLowerCase().includes(q) ||
             (t.accountName || '').toLowerCase().includes(q) ||
             (t.drName || '').toLowerCase().includes(q) ||
             (t.crName || '').toLowerCase().includes(q)
    })

    // Sort according to UI sorting preference (default newest first)
    list.sort((a, b) => {
      const cmp = (a.date || '').localeCompare(b.date || '')
      return sortAsc ? cmp : -cmp
    })

    return { list, enrichedAll }
  }

  const getGroupedTransactions = () => {
    const { list } = getEnrichedTransactions()
    const groups = {}
    
    // Sort list chronologically (oldest first) to compute correct closing balances
    const chronologicalList = [...list].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    
    chronologicalList.forEach(t => {
      let key = ''
      let label = ''
      
      const d = new Date(t.date)
      if (isNaN(d.getTime())) {
        key = 'unknown'
        label = 'Unknown Period'
      } else {
        const year = d.getFullYear()
        if (breakupMode === 'daily') {
          key = t.date
          label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        } else if (breakupMode === 'weekly') {
          const target = new Date(d.valueOf())
          const dayNr = (d.getDay() + 6) % 7
          target.setDate(target.getDate() - dayNr + 3)
          const firstThursday = target.valueOf()
          target.setMonth(0, 1)
          if (target.getDay() !== 4) {
            target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7))
          }
          const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000)
          
          const start = new Date(d.valueOf())
          start.setDate(start.getDate() - dayNr)
          const end = new Date(start.valueOf())
          end.setDate(end.getDate() + 6)
          
          const formatDateCompact = (date) => {
            return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
          }
          
          key = `${start.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
          label = `Week ${weekNum}, ${start.getFullYear()} (${formatDateCompact(start)} - ${formatDateCompact(end)})`
        } else if (breakupMode === 'monthly') {
          const monthStr = d.toLocaleDateString('en-IN', { month: 'long' })
          key = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`
          label = `${monthStr} ${year}`
        } else if (breakupMode === 'quarterly') {
          const quarter = Math.floor(d.getMonth() / 3) + 1
          const qNames = ['Jan - Mar', 'Apr - Jun', 'Jul - Sep', 'Oct - Dec']
          key = `${year}-Q${quarter}`
          label = `Q${quarter} ${year} (${qNames[quarter - 1]})`
        } else if (breakupMode === 'annual') {
          key = `${year}`
          label = `${year}`
        }
      }
      
      if (!groups[key]) {
        groups[key] = {
          period: label,
          key,
          vouchersCount: 0,
          debit: 0,
          credit: 0,
          lastRunningBalance: accountOpeningBalance
        }
      }
      
      groups[key].vouchersCount += 1
      groups[key].debit += t.debit || 0
      groups[key].credit += t.credit || 0
      groups[key].lastRunningBalance = t.runningBalance
    })
    
    const result = Object.values(groups)
    result.sort((a, b) => a.key.localeCompare(b.key))
    
    if (!sortAsc) {
      result.reverse()
    }
    
    return result
  }

  const filteredData = getEnrichedTransactions()
  const filtered = filteredData.list

  // Calculate final dynamic balance for summary card
  const getFinalRunningBalance = () => {
    if (filtered.length === 0) return accountOpeningBalance
    const newest = sortAsc ? filtered[filtered.length - 1] : filtered[0]
    return newest.runningBalance
  }

  // Get exact closing balance dynamically
  const getAccountCurrentBalance = () => {
    if (!filterAccountName) return null
    const { enrichedAll } = filteredData
    if (enrichedAll.length === 0) return accountOpeningBalance
    return enrichedAll[enrichedAll.length - 1].runningBalance
  }
  const accountCurrentBalance = getAccountCurrentBalance()

  const totalAmount = filtered.reduce((sum, t) => sum + (t.amount || 0), 0)

  const getHeaderInfo = () => {
    if (filterAccountName) return { title: `${filterAccountName} Register`, desc: 'Account ledger transactions (All Vouchers)' }
    if (registerType === 'payment') return { title: 'Payments Register', desc: 'Outward payments list' }
    if (registerType === 'receipt') return { title: 'Receipts Register', desc: 'Inward receipts list' }
    if (registerType === 'contra') return { title: 'Contra Register', desc: 'Bank-to-bank transfers list' }
    return { title: 'Daybook Live', desc: 'Real-time transaction feed' }
  }
  const headerInfo = getHeaderInfo()

  const getAccountTotalDebit = (defaultDr) => {
    if (!filterAccountName) return defaultDr
    try {
      const cachedAccountsRaw = localStorage.getItem('quickaccpro_cached_accounts')
      if (cachedAccountsRaw) {
        const accounts = JSON.parse(cachedAccountsRaw)
        const matched = accounts.find(a => (a.name || '').toLowerCase() === filterAccountName.toLowerCase())
        if (matched && matched.debit !== undefined) return Number(matched.debit)
      }
    } catch (e) {}
    return defaultDr
  }

  const getAccountTotalCredit = (defaultCr) => {
    if (!filterAccountName) return defaultCr
    try {
      const cachedAccountsRaw = localStorage.getItem('quickaccpro_cached_accounts')
      if (cachedAccountsRaw) {
        const accounts = JSON.parse(cachedAccountsRaw)
        const matched = accounts.find(a => (a.name || '').toLowerCase() === filterAccountName.toLowerCase())
        if (matched && matched.credit !== undefined) return Number(matched.credit)
      }
    } catch (e) {}
    return defaultCr
  }

  // Dispatch header update event for Layout component
  useEffect(() => {
    const listDr = filtered.reduce((sum, t) => sum + (t.debit || 0), 0)
    const listCr = filtered.reduce((sum, t) => sum + (t.credit || 0), 0)
    const totalDr = getAccountTotalDebit(listDr)
    const totalCr = getAccountTotalCredit(listCr)
    
    const event = new CustomEvent('quickaccpro-register-active', {
      detail: {
        accountName: filterAccountName || headerInfo.title,
        totalDebit: totalDr,
        totalCredit: totalCr,
        refreshing: refreshing,
        vouchersCount: filtered.length,
        currentBalance: filterAccountName ? accountCurrentBalance : null,
        dateMode,
        filterDate,
        filterMonth,
        startDate,
        endDate,
        search
      }
    })
    window.dispatchEvent(event)

    return () => {
      window.dispatchEvent(new CustomEvent('quickaccpro-register-active', { detail: null }))
    }
  }, [filterAccountName, filtered, refreshing, dateMode, filterDate, filterMonth, startDate, endDate, search, accountCurrentBalance])

  // Listen to refresh clicks from the Layout top header bar
  useEffect(() => {
    const handleTriggerRefresh = () => {
      handleRefresh()
    }
    window.addEventListener('quickaccpro-register-refresh', handleTriggerRefresh)
    return () => {
      window.removeEventListener('quickaccpro-register-refresh', handleTriggerRefresh)
    }
  }, [handleRefresh])

  // Listen to download clicks from the Layout top header bar
  useEffect(() => {
    const handleTriggerDownload = () => {
      downloadCSV()
    }
    window.addEventListener('quickaccpro-register-download', handleTriggerDownload)
    return () => {
      window.removeEventListener('quickaccpro-register-download', handleTriggerDownload)
    }
  }, [filtered, filterAccountName, dateMode])

  // Listen to PDF download clicks from the Layout top header bar
  useEffect(() => {
    const handleTriggerPDFDownload = () => {
      downloadPDF()
    }
    window.addEventListener('quickaccpro-register-pdf-download', handleTriggerPDFDownload)
    return () => {
      window.removeEventListener('quickaccpro-register-pdf-download', handleTriggerPDFDownload)
    }
  }, [filtered, filterAccountName, dateMode])

  const handlePeriodClick = (row) => {
    const key = row.key
    if (breakupMode === 'daily') {
      setDateMode('single')
      setFilterDate(key)
    } else if (breakupMode === 'weekly') {
      const { list } = getEnrichedTransactions()
      const txnsInPeriod = list.filter(t => {
        const d = new Date(t.date)
        if (isNaN(d.getTime())) return false
        const target = new Date(d.valueOf())
        const dayNr = (d.getDay() + 6) % 7
        target.setDate(target.getDate() - dayNr + 3)
        const firstThursday = target.valueOf()
        target.setMonth(0, 1)
        if (target.getDay() !== 4) {
          target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7))
        }
        const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000)
        const start = new Date(d.valueOf())
        start.setDate(start.getDate() - dayNr)
        const calculatedKey = `${start.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
        return calculatedKey === key
      })
      
      if (txnsInPeriod.length > 0) {
        const dates = txnsInPeriod.map(t => t.date).filter(Boolean)
        dates.sort()
        setDateMode('custom')
        setStartDate(dates[0])
        setEndDate(dates[dates.length - 1])
      } else {
        const [year, weekStr] = key.split('-W')
        const week = Number(weekStr)
        const simple = new Date(Number(year), 0, 1 + (week - 1) * 7)
        const dow = simple.getDay()
        const ISOweekStart = simple
        if (dow <= 4) {
          ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1)
        } else {
          ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay())
        }
        const startStr = ISOweekStart.toISOString().split('T')[0]
        const ISOweekEnd = new Date(ISOweekStart.valueOf())
        ISOweekEnd.setDate(ISOweekEnd.getDate() + 6)
        const endStr = ISOweekEnd.toISOString().split('T')[0]
        
        setDateMode('custom')
        setStartDate(startStr)
        setEndDate(endStr)
      }
    } else if (breakupMode === 'monthly') {
      setDateMode('month')
      setFilterMonth(key)
    } else if (breakupMode === 'quarterly') {
      const [year, qStr] = key.split('-Q')
      const quarter = Number(qStr)
      const startMonth = String((quarter - 1) * 3 + 1).padStart(2, '0')
      const endMonth = String(quarter * 3).padStart(2, '0')
      const lastDay = new Date(Number(year), quarter * 3, 0).getDate()
      
      setDateMode('custom')
      setStartDate(`${year}-${startMonth}-01`)
      setEndDate(`${year}-${endMonth}-${String(lastDay).padStart(2, '0')}`)
    } else if (breakupMode === 'annual') {
      setDateMode('custom')
      setStartDate(`${key}-01-01`)
      setEndDate(`${key}-12-31`)
    }
    
    setBreakupMode('detailed')
  }

  const getTypeConfig = (type) => TYPE_CONFIG[type] || { label: type, icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100' }

  // Paginated List
  const groupedData = getGroupedTransactions()
  const totalPages = breakupMode === 'detailed'
    ? Math.ceil(filtered.length / pageSize)
    : Math.ceil(groupedData.length / pageSize)
  const paginated = breakupMode === 'detailed'
    ? filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : groupedData.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Calculate display range label
  const getRangeLabel = () => {
    if (dateMode === 'all') return 'All transactions';
    if (dateMode === 'single') return `Date: ${formatDate(filterDate)}`;
    if (dateMode === 'custom') return `${formatDate(startDate)} — ${formatDate(endDate)}`;
    if (dateMode === 'month') return `Month: ${filterMonth}`;
    return '';
  };

  return (
    <div className="space-y-5 text-slate-800">
      {/* Compact Header & Type Filters row */}
      {!loading && (
        <div className="flex justify-between items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 shadow-sm">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {registerType ? `${registerType} List` : 'Transaction Feed'}
          </div>
          <div className="flex items-center gap-2">
            {!registerType && (
              <>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden xs:inline">Type:</span>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="input-field py-1 px-2.5 text-xs w-auto min-w-[110px]"
                >
                  <option value="all">All Types</option>
                  <option value="invoices">Invoices</option>
                  <option value="payments">Payments</option>
                  <option value="receipts">Receipts</option>
                  <option value="contra">Contra</option>
                  <option value="journal_vouchers">Journals</option>
                </select>
              </>
            )}
            {filterAccountName && (
              <div className="relative">
                <button
                  onClick={() => setShowBreakupSelector(!showBreakupSelector)}
                  className="flex items-center gap-1.5 py-1 px-2.5 text-xs font-bold bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 shadow-sm active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                >
                  <span>{
                    breakupMode === 'detailed' ? 'Detailed View' :
                    breakupMode === 'daily' ? 'Daily View' :
                    breakupMode === 'weekly' ? 'Weekly View' :
                    breakupMode === 'monthly' ? 'Monthly View' :
                    breakupMode === 'quarterly' ? 'Quarterly View' : 'Annual View'
                  }</span>
                  <ChevronDown size={14} />
                </button>
                {showBreakupSelector && (
                  <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 text-slate-700">
                    <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-black text-indigo-950 tracking-wider">
                      SELECT BREAKUP MODE
                    </div>
                    {[
                      { mode: 'detailed', title: 'DETAILED TRANSACTIONS', desc: 'All entries line by line' },
                      { mode: 'daily', title: 'DAILY BREAKUP SUMMARY', desc: 'Date, Debit, Credit, Value' },
                      { mode: 'weekly', title: 'WEEKLY BREAKUP SUMMARY', desc: 'Week-wise totals' },
                      { mode: 'monthly', title: 'MONTHLY BREAKUP SUMMARY', desc: 'Month-wise totals' },
                      { mode: 'quarterly', title: 'QUARTERLY BREAKUP SUMMARY', desc: 'Quarter-wise totals' },
                      { mode: 'annual', title: 'ANNUAL BREAKUP SUMMARY', desc: 'Year-wise totals' }
                    ].map(item => (
                      <button
                        key={item.mode}
                        onClick={() => {
                          setBreakupMode(item.mode)
                          setShowBreakupSelector(false)
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors flex flex-col gap-0.5 ${breakupMode === item.mode ? 'bg-indigo-50 border-r-4 border-indigo-600' : ''}`}
                      >
                        <span className="text-[11px] font-extrabold text-slate-800">{item.title}</span>
                        <span className="text-[9px] text-slate-400 font-semibold">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setSortAsc(!sortAsc)}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 transition-all bg-white"
              title={sortAsc ? 'Newest first' : 'Oldest first'}
            >
              <ArrowUpDown size={14} className={`transition-transform ${sortAsc ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Date range indicator */}
      {!loading && (
        <div className="flex items-center justify-between px-1">
          <div className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
            {getRangeLabel()}
          </div>
          <div className="text-[10px] text-slate-400 font-medium">
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
          <button onClick={loadData} className="ml-auto text-xs font-semibold underline">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 mt-4">Loading transactions...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen size={40} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">
            {search || filterType !== 'all' ? 'No matching transactions' : 'No transactions found'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {search || filterType !== 'all' ? 'Try adjusting your filters' : 'Data will appear once synced from AccountsPro'}
          </p>
        </div>
      )}

      {/* Transaction list */}
      {!loading && paginated.length > 0 && (
        filterAccountName ? (
          breakupMode === 'detailed' ? (
            <div className="card overflow-x-auto p-0 border border-slate-200 shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white border-b border-slate-700 text-[10px] font-bold uppercase tracking-wider select-none">
                    <th onClick={() => setSortAsc(!sortAsc)} className="p-3 cursor-pointer hover:bg-slate-800 transition-colors select-none">
                      Date {sortAsc ? '▲' : '▼'}
                    </th>
                    <th className="p-3">Vch Type</th>
                    <th className="p-3">Particulars</th>
                    <th onClick={() => setSortAsc(!sortAsc)} className="p-3 cursor-pointer hover:bg-slate-800 transition-colors select-none">
                      Ref
                    </th>
                    <th className="p-3 text-right">Debit (DHS)</th>
                    <th className="p-3 text-right">Credit (DHS)</th>
                    <th className="p-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filterAccountName && (
                    <tr className="bg-slate-100/90 font-bold border-b border-slate-200">
                      <td className="p-3"></td>
                      <td className="p-3 text-slate-500 font-bold text-[9px] uppercase tracking-wider">TOTALS</td>
                      <td className="p-3 text-right text-slate-800 font-extrabold text-[10px] uppercase tracking-wide">
                        CURRENT TOTALS:
                      </td>
                      <td className="p-3"></td>
                      <td className="p-3 text-right text-green-700 font-bold font-mono text-[11px] whitespace-nowrap">
                        {formatCurrency(filtered.reduce((sum, t) => sum + (t.debit || 0), 0))}
                      </td>
                      <td className="p-3 text-right text-red-600 font-bold font-mono text-[11px] whitespace-nowrap">
                        {formatCurrency(filtered.reduce((sum, t) => sum + (t.credit || 0), 0))}
                      </td>
                      <td className="p-3 text-right text-slate-800 font-bold font-mono text-[11px] whitespace-nowrap">
                        {formatCurrency(Math.abs(accountCurrentBalance))}
                        <span className="text-[9px] text-slate-400 ml-1">
                          {accountCurrentBalance >= 0 ? 'Dr' : 'Cr'}
                        </span>
                      </td>
                    </tr>
                  )}
                  {paginated.map((tx, i) => {
                    const cfg = getTypeConfig(tx.type)
                    const isDr = tx.debit > 0
                    const isCr = tx.credit > 0
                    
                    // Label & styling overrides for Debit/Credit
                    let label = cfg.label
                    let colorClass = cfg.color
                    let bgClass = cfg.bg
                    
                    if (tx.type === 'payments') {
                      if (tx.subType === 'in' || tx.subType === 'receipt') {
                        label = 'RECEIPT'
                        colorClass = 'text-green-700'
                        bgClass = 'bg-green-100/60 border border-green-200'
                      } else if (tx.subType === 'out' || tx.subType === 'payment') {
                        label = 'PAYMENT'
                        colorClass = 'text-red-700'
                        bgClass = 'bg-red-100/60 border border-red-200'
                      } else if (tx.subType?.toLowerCase() === 'contra') {
                        label = 'CONTRA'
                        colorClass = 'text-blue-700'
                        bgClass = 'bg-blue-100/60 border border-blue-200'
                      }
                    } else if (tx.type === 'journal_vouchers') {
                      label = 'JOURNAL'
                      colorClass = 'text-purple-700'
                      bgClass = 'bg-purple-100/60 border border-purple-200'
                    }

                    const particulars = getParticulars(tx)

                    return (
                      <tr 
                        key={tx.id || i} 
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                        onClick={() => setSelectedTx(tx)}
                      >
                        <td className="p-3 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          {formatDate(tx.date)}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${bgClass} ${colorClass}`}>
                            {label}
                          </span>
                        </td>
                        <td className="p-3 max-w-[240px] truncate">
                          <span className="text-slate-800 font-bold uppercase text-[11px] block">{particulars}</span>
                          {tx.description && (
                            <span className="text-[10px] text-slate-400 font-medium italic truncate mt-0.5 block">{tx.description}</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-slate-500 text-[11px]">{tx.refNo || '—'}</td>
                        <td className="p-3 text-right text-green-700 font-bold font-mono text-[11px]">
                          {isDr ? formatCurrency(tx.debit) : '—'}
                        </td>
                        <td className="p-3 text-right text-red-600 font-bold font-mono text-[11px]">
                          {isCr ? formatCurrency(tx.credit) : '—'}
                        </td>
                        <td className="p-3 text-right text-slate-800 font-bold font-mono text-[11px] whitespace-nowrap">
                          {formatCurrency(Math.abs(tx.runningBalance))}
                          <span className="text-[9px] text-slate-400 ml-1">
                            {tx.runningBalance >= 0 ? 'Dr' : 'Cr'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card overflow-x-auto p-0 border border-slate-200 shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white border-b border-slate-700 text-[10px] font-bold uppercase tracking-wider select-none">
                    <th className="p-3">PERIOD</th>
                    <th className="p-3 text-center">VOUCHERS</th>
                    <th className="p-3 text-right">DEBIT (AED)</th>
                    <th className="p-3 text-right">CREDIT (AED)</th>
                    <th className="p-3 text-right">BALANCE</th>
                    <th className="p-3 text-center">SUMMARY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  <tr className="bg-slate-100 font-bold border-b border-slate-200">
                    <td className="p-3 text-slate-800 font-extrabold text-[10px] uppercase tracking-wider">CURRENT TOTALS:</td>
                    <td className="p-3 text-center text-slate-600">({filtered.length} Vch)</td>
                    <td className="p-3 text-right text-green-700 font-bold font-mono text-[11px] whitespace-nowrap">
                      {formatCurrency(filtered.reduce((sum, t) => sum + (t.debit || 0), 0), 3)}
                    </td>
                    <td className="p-3 text-right text-red-600 font-bold font-mono text-[11px] whitespace-nowrap">
                      {formatCurrency(filtered.reduce((sum, t) => sum + (t.credit || 0), 0), 3)}
                    </td>
                    <td className="p-3 text-right text-slate-800 font-bold font-mono text-[11px] whitespace-nowrap">
                      {formatCurrency(Math.abs(accountCurrentBalance), 3)}
                      <span className="text-[9px] text-slate-400 ml-1">
                        {accountCurrentBalance >= 0 ? 'Dr' : 'Cr'}
                      </span>
                    </td>
                    <td className="p-3 text-center text-slate-300">—</td>
                  </tr>
                  {paginated.map((row, i) => (
                    <tr 
                      key={row.key} 
                      onClick={() => handlePeriodClick(row)}
                      className="hover:bg-slate-50/80 border-b border-slate-100 cursor-pointer active:bg-slate-100/50 transition-colors"
                    >
                      <td className="p-3 text-indigo-700 font-bold uppercase">{row.period}</td>
                      <td className="p-3 text-center text-slate-500">({row.vouchersCount} Vch)</td>
                      <td className="p-3 text-right text-green-700 font-bold font-mono">
                        {row.debit > 0 ? formatCurrency(row.debit, 3) : '0.000'}
                      </td>
                      <td className="p-3 text-right text-red-600 font-bold font-mono">
                        {row.credit > 0 ? formatCurrency(row.credit, 3) : '0.000'}
                      </td>
                      <td className="p-3 text-right font-bold font-mono whitespace-nowrap">
                        {formatCurrency(Math.abs(row.lastRunningBalance), 3)}
                        <span className={`text-[9px] ml-1 ${row.lastRunningBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {row.lastRunningBalance >= 0 ? 'Dr' : 'Cr'}
                        </span>
                      </td>
                      <td className="p-3 text-center text-slate-400">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="space-y-2">
            {paginated.map((tx, i) => {
              const cfg = getTypeConfig(tx.type)
              const Icon = cfg.icon
              
              let label = cfg.label
              let colorClass = cfg.color
              let bgClass = cfg.bg
              
              if (tx.type === 'payments') {
                if (tx.subType === 'in' || tx.subType === 'receipt') {
                  label = 'RECEIPT'
                  colorClass = 'text-green-700'
                  bgClass = 'bg-green-100/60 border border-green-200'
                } else if (tx.subType === 'out' || tx.subType === 'payment') {
                  label = 'PAYMENT'
                  colorClass = 'text-red-700'
                  bgClass = 'bg-red-100/60 border border-red-200'
                } else if (tx.subType?.toLowerCase() === 'contra') {
                  label = 'CONTRA'
                  colorClass = 'text-blue-700'
                  bgClass = 'bg-blue-100/60 border border-blue-200'
                }
              } else if (tx.type === 'journal_vouchers') {
                label = 'JOURNAL'
                colorClass = 'text-purple-700'
                bgClass = 'bg-purple-100/60 border border-purple-200'
              }

              const particulars = getParticulars(tx)

              return (
                <div
                  key={tx.id || i}
                  className="card p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className="flex items-start gap-3">
                    {/* Type icon */}
                    <div className={`w-9 h-9 rounded-xl ${bgClass} flex items-center justify-center shrink-0`}>
                      <Icon size={16} className={colorClass} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`badge ${bgClass} ${colorClass}`}>{label}</span>
                        {tx.refNo && (
                          <span className="text-xs font-mono text-slate-500">{tx.refNo}</span>
                        )}
                      </div>

                      <p className="text-slate-800 font-bold uppercase text-[11px] mt-1.5">{particulars}</p>

                      <p className="text-sm font-semibold text-slate-800 mt-1">
                        {formatCurrency(tx.amount)}
                      </p>

                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDate(tx.date)}
                        </span>
                      </div>

                      {tx.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1 italic">{tx.description}</p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
      ))}

      {/* Pagination controls */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 mt-4">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            Previous
          </button>
          
          <span className="text-xs text-slate-500 font-medium">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            Next
          </button>
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden transform scale-100 transition-all">
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
                    selectedTx.subType === 'out' || selectedTx.subType === 'payment' ? 'bg-red-100 text-red-700' : 
                    selectedTx.subType === 'in' || selectedTx.subType === 'receipt' ? 'bg-green-100 text-green-700' : 
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {selectedTx.type || 'Transaction'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start justify-between border-b border-slate-50 pb-2">
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Payer (Credit)</p>
                    <p className="font-bold text-red-600 uppercase text-[11px]">{selectedTx.crName || selectedTx.accountName || '—'}</p>
                  </div>
                  <span className="text-slate-300 font-bold mt-2">➔</span>
                  <div className="space-y-0.5 text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Receiver (Debit)</p>
                    <p className="font-bold text-green-700 uppercase text-[11px]">{selectedTx.drName || selectedTx.partyName || '—'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b border-slate-50 pb-3">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Debit Amount</p>
                    <p className="font-mono text-sm font-bold text-green-700 mt-0.5">
                      {selectedTx.debit > 0 ? `${formatCurrency(selectedTx.debit)} DHS` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Credit Amount</p>
                    <p className="font-mono text-sm font-bold text-red-600 mt-0.5">
                      {selectedTx.credit > 0 ? `${formatCurrency(selectedTx.credit)} DHS` : '—'}
                    </p>
                  </div>
                </div>

                {selectedTx.description && (
                  <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-100/50">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Narration / Description</p>
                    <p className="text-slate-600 italic font-medium mt-1 leading-relaxed">{selectedTx.description}</p>
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
              
              {(selectedTx.type?.toLowerCase() === 'payment' || selectedTx.subType === 'payment' || selectedTx.subType === 'out') && (
                <>
                  {selectedTx.createdBy && subUser && selectedTx.createdBy === subUser.id && (
                    <button
                      onClick={() => { navigate('/voucher/edit/' + selectedTx.id); setSelectedTx(null); }}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => { 
                      if (window.confirm("Are you sure you want to delete this voucher?")) {
                        handleDeleteVoucher(selectedTx); 
                        setSelectedTx(null);
                      }
                    }}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
