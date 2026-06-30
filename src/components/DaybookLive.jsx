import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { 
  BookOpen, RefreshCw, Search, Filter, ArrowUpDown, 
  Receipt, Wallet, Notebook, AlertCircle, Clock, 
  ChevronDown, ChevronUp, FileText, ChevronLeft, ChevronRight, Download, Share2
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
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 50

  // Date filters state
  const todayStr = getTodayStr()
  const yesterdayStr = getYesterdayStr()
  const [dateMode, setDateMode] = useState('all') // Default to all transactions
  const [filterDate, setFilterDate] = useState(todayStr)
  const [filterMonth, setFilterMonth] = useState(todayStr.substring(0, 7))
  const [startDate, setStartDate] = useState(yesterdayStr) // Default start range to yesterday
  const [endDate, setEndDate] = useState(todayStr)


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


  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, filterType, dateMode, filterDate, filterMonth, startDate, endDate])

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
      const hasBankOrAccount = (name) => {
        if (!name) return false;
        const upper = name.toUpperCase();
        return upper.includes('BANK') || upper.includes('A/C') || upper.includes('ACCOUNT');
      };
      if (t.subType === 'contra' || (t.drName && t.crName && (hasBankOrAccount(t.drName) || hasBankOrAccount(t.crName)))) {
        return `${t.accountName} / ${t.drName === t.accountName ? t.crName : t.drName}`
      }
      return `${t.accountName} / ${t.partyName || t.description || 'Payment'}`
    }
    if (t.type === 'journal_vouchers') {
      return `${t.drName} / ${t.crName}`
    }
    return t.description || t.partyName || 'Transaction'
  }

  const getEnrichedTransactions = () => {
    let list = transactions.filter(t => {
      // Filter by specific accountName if provided (Cash/Bank Register)
      if (filterAccountName) {
        const nameLower = filterAccountName.toLowerCase()
        const isMatch = (t.accountName || '').toLowerCase() === nameLower ||
                        (t.drName || '').toLowerCase() === nameLower ||
                        (t.crName || '').toLowerCase() === nameLower ||
                        (t.partyName || '').toLowerCase() === nameLower ||
                        (t.description || '').toLowerCase().includes(nameLower) ||
                        (t.drName || '').toLowerCase().split(', ').map(n => n.trim()).includes(nameLower) ||
                        (t.crName || '').toLowerCase().split(', ').map(n => n.trim()).includes(nameLower)
        if (!isMatch) return false
      }

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
          // Normal Daybook filters
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

    // Sort chronologically (oldest first) to compute running balance
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    let runningVal = accountOpeningBalance
    const enriched = list.map(t => {
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

        // ─── Payment vouchers: determine side by subType ───
        if (t.type === 'payments' && isAccountNameMatch) {
          if (t.subType === 'in' || t.subType === 'receipt') {
            // RECEIPT: Money coming IN to this account → Debit
            isDr = true
          } else if (t.subType === 'out' || t.subType === 'payment') {
            // PAYMENT: Money going OUT from this account → Credit
            isCr = true
          } else if (t.subType?.toLowerCase() === 'contra') {
            // CONTRA data model:
            //   drName = destination account (receives money, being debited)
            //   crName = source account (sends money, being credited)
            //   accountName = source account
            // So for the account we're viewing:
            //   If it matches drName → it's the DESTINATION → receiving → DEBIT
            //   If it matches crName or accountName → it's the SOURCE → sending → CREDIT
            if (isDrMatch && !isCrMatch) {
              // Account is ONLY in drName → destination → receiving → DEBIT
              isDr = true
            } else {
              // Account is in crName, accountName, or both → source side → CREDIT
              isCr = true
            }
          }
        } else if (isDrMatch) {
          // Account is in drName → receiving end → DEBIT
          isDr = true
          if (t.isMulti && t.splits) {
            const matchedSplit = t.splits.find(s => (s.targetName || '').toLowerCase() === nameLower)
            if (matchedSplit) {
              amt = Number(matchedSplit.amount || 0)
            }
          }
        } else if (isCrMatch) {
          // Account is in crName → giving end → CREDIT
          isCr = true
          if (t.isMulti && t.splits && t.type === 'journal_vouchers') {
            const matchedSplit = t.splits.find(s => (s.targetName || '').toLowerCase() === nameLower && s.type === 'cr')
            if (matchedSplit) {
              amt = Number(matchedSplit.amount || 0)
            }
          }
        } else if (isAccountNameMatch) {
          // accountName matches but no drName/crName match and not a payment voucher
          // This is likely an invoice or journal — treat as debit by default
          isDr = true
        }
      } else {
        // Fallback default daybook logic (when viewing all daybook logs)
        if (t.type === 'payments') {
          if (t.subType === 'in' || t.subType === 'receipt') {
            isDr = true
          } else if (t.subType === 'out' || t.subType === 'payment') {
            isCr = true
          } else if (t.subType?.toLowerCase() === 'contra') {
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

    // Sort according to UI sorting preference (default newest first)
    enriched.sort((a, b) => {
      const cmp = (a.date || '').localeCompare(b.date || '')
      return sortAsc ? cmp : -cmp
    })

    return enriched
  }

  const filtered = getEnrichedTransactions()

  // Calculate final dynamic balance for summary card
  const getFinalRunningBalance = () => {
    if (filtered.length === 0) return accountOpeningBalance
    const newest = sortAsc ? filtered[filtered.length - 1] : filtered[0]
    return newest.runningBalance
  }
  // Get exact closing balance from cache
  const getAccountCurrentBalance = () => {
    if (!filterAccountName) return null
    try {
      const cachedAccountsRaw = localStorage.getItem('quickaccpro_cached_accounts')
      if (cachedAccountsRaw) {
        const accounts = JSON.parse(cachedAccountsRaw)
        const matched = accounts.find(a => (a.name || '').toLowerCase() === filterAccountName.toLowerCase())
        if (matched && matched.balance !== undefined) return Number(matched.balance)
      }
    } catch (e) {}
    try {
      const cachedLedgersRaw = localStorage.getItem('quickaccpro_cached_ledgers')
      if (cachedLedgersRaw) {
        const ledgers = JSON.parse(cachedLedgersRaw)
        const matched = ledgers.find(l => (l.name || '').toLowerCase() === filterAccountName.toLowerCase())
        if (matched && matched.balance !== undefined) return Number(matched.balance)
      }
    } catch (e) {}
    return getFinalRunningBalance()
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

  const getTypeConfig = (type) => TYPE_CONFIG[type] || { label: type, icon: FileText, color: 'text-slate-600', bg: 'bg-slate-100' }

  // Paginated List
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

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
                  <th className="p-3 text-center">Actions</th>
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
                    <td className="p-3"></td>
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
                      className="hover:bg-slate-50/70 transition-colors"
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
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadVoucherPdf(tx); }}
                            className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded transition-colors"
                            title="Download PDF"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); shareVoucherPdf(tx); }}
                            className="p-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded transition-colors"
                            title="Share PDF"
                          >
                            <Share2 size={12} />
                          </button>
                          
                          {tx.type === 'payments' && (
                            <>
                              {tx.createdBy && subUser && tx.createdBy === subUser.id && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate('/voucher/edit/' + tx.id); }}
                                  className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded text-[9px] transition-colors"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteVoucher(tx); }}
                                className="px-1.5 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded text-[9px] transition-colors"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2">
            {paginated.map((tx, i) => {
              const cfg = getTypeConfig(tx.type)
              const Icon = cfg.icon
              const isExpanded = expandedId === tx.id

              return (
                <div
                  key={tx.id || i}
                  className="card p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Type icon */}
                    <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0`}>
                      <Icon size={16} className={cfg.color} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`badge ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                        {tx.subType && (
                          <span className="badge bg-slate-100 text-slate-600">{tx.subType}</span>
                        )}
                        {tx.refNo && (
                          <span className="text-xs font-mono text-slate-500">{tx.refNo}</span>
                        )}
                      </div>

                      <p className="text-sm font-semibold text-slate-800 mt-1.5">
                        {formatCurrency(tx.amount)}
                      </p>

                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {formatDate(tx.date)}
                        </span>
                        {tx.partyName && <span>· {tx.partyName}</span>}
                        {tx.accountName && <span>· {tx.accountName}</span>}
                      </div>

                      {tx.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{tx.description}</p>
                      )}
                    </div>

                    {/* Expand indicator */}
                    <div className="shrink-0 pt-1">
                      {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400 font-medium">Type</span>
                        <p className="text-slate-700 font-medium capitalize">{tx.type.replace('_', ' ')}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Ref No</span>
                        <p className="text-slate-700 font-mono">{tx.refNo || '—'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Date</span>
                        <p className="text-slate-700">{formatDate(tx.date)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Amount</span>
                        <p className="text-slate-700 font-semibold">{formatCurrency(tx.amount)}</p>
                      </div>
                      {tx.drName && (
                        <div>
                          <span className="text-slate-400 font-medium">Debit</span>
                          <p className="text-slate-700">{tx.drName}</p>
                        </div>
                      )}
                      {tx.crName && (
                        <div>
                          <span className="text-slate-400 font-medium">Credit</span>
                          <p className="text-slate-700">{tx.crName}</p>
                        </div>
                      )}
                      {tx.partyName && (
                        <div className="col-span-2">
                          <span className="text-slate-400 font-medium">Party</span>
                          <p className="text-slate-700">{tx.partyName}</p>
                        </div>
                      )}
                      {tx.description && (
                        <div className="col-span-2">
                          <span className="text-slate-400 font-medium">Description</span>
                          <p className="text-slate-700">{tx.description}</p>
                        </div>
                      )}

                    <div className="col-span-2">
                      <span className="text-slate-400 font-medium">Status</span>
                      <span className={`badge ml-1 ${tx.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                        {tx.status || 'active'}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center flex-wrap gap-2 pt-2 border-t border-slate-100 mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); downloadVoucherPdf(tx); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                      >
                        <Download size={12} />
                        PDF
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); shareVoucherPdf(tx); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-xl text-xs transition-colors"
                      >
                        <Share2 size={12} />
                        Share PDF
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); shareVoucherText(tx); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold rounded-xl text-xs transition-colors"
                      >
                        <Share2 size={12} />
                        Share Text
                      </button>
                      
                      {tx.type === 'payments' && (
                        <>
                          {tx.createdBy && subUser && tx.createdBy === subUser.id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate('/voucher/edit/' + tx.id); }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-colors"
                            >
                              Edit
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteVoucher(tx); }}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
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

      {/* Count */}
      {!loading && filtered.length > 0 && (
        <p className="text-center text-[10px] text-slate-400 font-medium">
          Showing {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}-{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} matching transactions (from {transactions.length} loaded)
        </p>
      )}
    </div>
  )
}
