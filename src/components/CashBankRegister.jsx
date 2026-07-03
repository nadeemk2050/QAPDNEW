import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Search, ArrowLeft, ArrowRight, RefreshCw, Wallet2, Clock, ArrowUpDown } from 'lucide-react'
import { listAccounts, getAccountLedger, getDaybookAll } from '../api'
import { getCurrentCompanyId, getDB } from '../localDB'

const getDaysAgoStr = (days) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function CashBankRegister() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [ledgerTxns, setLedgerTxns] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(false)

  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async (isRef = false) => {
    if (isRef) setRefreshing(true)
    else setLoading(true)
    
    const cacheKey = 'quickaccpro_cached_accounts'
    const cachedRaw = localStorage.getItem(cacheKey)
    if (cachedRaw && !isRef) {
      try {
        setAccounts(JSON.parse(cachedRaw))
        setLoading(false)
      } catch (e) {}
    }

    try {
      const data = await listAccounts()
      const list = data.accounts || []
      
      const txnsData = await getDaybookAll().catch(() => ({ transactions: [] }))
      const allTxns = txnsData.transactions || []
      
      const enrichedAccounts = list.map(acc => {
        const nameLower = acc.name.trim().toLowerCase()
        let balance = Number(acc.openingBalance || acc.balance || 0)
        
        const accTxns = allTxns.filter(t => {
          return (t.accountName || '').trim().toLowerCase() === nameLower ||
                 (t.drName || '').trim().toLowerCase() === nameLower ||
                 (t.crName || '').trim().toLowerCase() === nameLower ||
                 (t.partyName || '').trim().toLowerCase() === nameLower ||
                 (t.drName || '').toLowerCase().split(', ').map(n => n.trim().toLowerCase()).includes(nameLower) ||
                 (t.crName || '').toLowerCase().split(', ').map(n => n.trim().toLowerCase()).includes(nameLower)
        })
        accTxns.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        
        for (const t of accTxns) {
          let isDr = false
          let isCr = false
          let amt = Number(t.amount || 0)
          
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
          
          if (isDr) balance += amt
          if (isCr) balance -= amt
        }
        
        return {
          ...acc,
          balance
        }
      })

      setAccounts(enrichedAccounts)
      localStorage.setItem(cacheKey, JSON.stringify(enrichedAccounts))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const openAccountLedger = async (acc) => {
    setSelectedAccount(acc)
    setLedgerLoading(true)
    setLedgerTxns([])

    try {
      const data = await getAccountLedger(acc.id)
      const allTxns = data.transactions || []

      const tenDaysAgo = getDaysAgoStr(10)

      const txns = allTxns
        .filter(t => {
          // Filter by last 10 days
          if (!t.date || t.date < tenDaysAgo) return false
          return true
        })
        .map(t => {
          const typeLabel = t.subType === 'payment' || t.subType === 'out' ? 'Payment' : 
                            t.subType === 'receipt' || t.subType === 'in' ? 'Receipt' : 
                            t.subType === 'contra' ? 'Contra' : t.voucherType || 'Unknown'
          
          let debit = 0
          let credit = 0
          
          const typeLower = (t.subType || '').toLowerCase()
          if (typeLower === 'receipt' || typeLower === 'in') {
            debit = t.amount
          } else if (typeLower === 'payment' || typeLower === 'out') {
            credit = t.amount
          } else if (typeLower === 'contra') {
            const isDr = (t.drName || '').trim().toLowerCase() === (acc.name || '').trim().toLowerCase()
            if (isDr) {
              debit = t.amount
            } else {
              credit = t.amount
            }
          }

          return {
            id: t.id,
            date: t.date || '',
            refNo: t.refNo || '',
            type: typeLabel,
            subType: t.subType || '',
            amount: t.amount,
            narration: t.narration || '',
            partyName: t.partyName || '',
            drName: t.drName || '',
            crName: t.crName || '',
            accountName: t.accountName || '',
            debit,
            credit
          }
        })

      setLedgerTxns(txns)
    } catch (e) {
      console.warn('[QAPD] Failed to load account ledger:', e)
    } finally {
      setLedgerLoading(false)
    }
  }

  const closeLedger = () => {
    setSelectedAccount(null)
    setLedgerTxns([])
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

  const filtered = accounts.filter(acc => 
    (acc.name || '').toLowerCase().includes(search.toLowerCase())
  )

  // Ledger View for a selected account
  if (selectedAccount) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={closeLedger} className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors">
              <ArrowLeft size={20} className="text-slate-600" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-800 uppercase">{selectedAccount.name}</h2>
              <p className="text-xs text-slate-500">Account Ledger — Last 10 days · {ledgerTxns.length} transactions</p>
            </div>
          </div>
          <button onClick={() => openAccountLedger(selectedAccount)} className="btn-secondary text-xs" disabled={ledgerLoading}>
            <RefreshCw size={14} className={ledgerLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Balance Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center bg-blue-50 border-blue-100">
            <p className="text-[10px] font-bold text-blue-600 uppercase">Vouchers</p>
            <p className="text-xl font-black text-blue-800">{ledgerTxns.length}</p>
          </div>
          <div className="card p-3 text-center bg-green-50 border-green-100">
            <p className="text-[10px] font-bold text-green-600 uppercase">Total Dr</p>
            <p className="text-xl font-black text-green-800">{formatCurrency(ledgerTxns.reduce((s, t) => s + t.debit, 0))}</p>
          </div>
          <div className="card p-3 text-center bg-red-50 border-red-100">
            <p className="text-[10px] font-bold text-red-600 uppercase">Total Cr</p>
            <p className="text-xl font-black text-red-800">{formatCurrency(ledgerTxns.reduce((s, t) => s + t.credit, 0))}</p>
          </div>
        </div>

        {/* Transactions */}
        {ledgerLoading ? (
          <div className="flex flex-col items-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-sm text-slate-500 mt-3">Loading ledger...</p>
          </div>
        ) : ledgerTxns.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Wallet2 size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No transactions found</p>
            <p className="text-xs mt-1">Transactions will appear here once created</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header for Debit/Credit columns */}
            <div className="flex items-center justify-between px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>Transaction Details</span>
              <div className="flex items-center gap-6 mr-1">
                <span className="w-24 text-right">Debit (Dr)</span>
                <span className="w-24 text-right">Credit (Cr)</span>
              </div>
            </div>

            {ledgerTxns.map(tx => (
              <div key={tx.id} className="card p-3 border-l-4 border-l-indigo-400 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      tx.subType === 'out' || tx.subType === 'payment' ? 'bg-red-100 text-red-700' : 
                      tx.subType === 'in' || tx.subType === 'receipt' ? 'bg-green-100 text-green-700' : 
                      'bg-blue-100 text-blue-700'
                    }`}>{tx.type}</span>
                    <span className="text-[11px] font-mono text-slate-500">{tx.refNo}</span>
                  </div>
                  
                  {/* Two Columns for Debit and Credit */}
                  <div className="flex items-center gap-6 font-mono text-xs">
                    <div className="w-24 text-right">
                      {tx.debit > 0 ? (
                        <span className="text-green-700 font-bold">{formatCurrency(tx.debit)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                    <div className="w-24 text-right">
                      {tx.credit > 0 ? (
                        <span className="text-red-600 font-bold">{formatCurrency(tx.credit)}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500 border-t border-slate-50 pt-2">
                  <span className="flex items-center gap-1 font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded"><Clock size={10} />{formatDate(tx.date)}</span>
                  {tx.type === 'Contra' ? (
                    <span className="text-slate-600">
                      Payer: <span className="font-bold text-red-600">{tx.crName || 'Source'}</span>
                      <span className="mx-1.5 text-slate-400">➔</span>
                      Receiver: <span className="font-bold text-green-700">{tx.drName || 'Dest'}</span>
                    </span>
                  ) : tx.subType === 'payment' || tx.subType === 'out' ? (
                    <span className="text-slate-600">
                      Payer: <span className="font-bold text-slate-700">{selectedAccount.name}</span> · 
                      Receiver: <span className="font-bold text-indigo-700">{tx.partyName || tx.drName || '—'}</span>
                    </span>
                  ) : (
                    <span className="text-slate-600">
                      Payer: <span className="font-bold text-indigo-700">{tx.partyName || tx.crName || '—'}</span> · 
                      Receiver: <span className="font-bold text-slate-700">{selectedAccount.name}</span>
                    </span>
                  )}
                </div>
                {tx.narration && (
                  <p className="text-[10px] text-slate-400/80 mt-1.5 bg-slate-50 px-2 py-1 rounded italic truncate max-w-full" title={tx.narration}>
                    {tx.narration}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Account List View
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Cash / Bank Ledgers</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time balances of all cash & bank accounts</p>
        </div>
        <button
          onClick={() => loadAccounts(true)}
          disabled={refreshing}
          className="btn-secondary text-xs"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search cash or bank accounts..."
          className="input-field pl-10"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 mt-4">Loading balances...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Wallet2 size={36} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm">No accounts found matching "{search}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(acc => {
            const bal = Number(acc.balance || 0)
            const isNegative = bal < 0
            return (
              <div
                key={acc.id}
                onClick={() => navigate(`/daybook?accountName=${encodeURIComponent(acc.name)}`)}
                className="card p-4 hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isNegative ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide truncate max-w-[180px] sm:max-w-xs">
                      {acc.name}
                    </h3>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">
                      Account ID: {acc.id}
                    </p>
                  </div>
                </div>

                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className={`text-base font-bold font-mono ${isNegative ? 'text-red-600' : 'text-slate-800'}`}>
                      {formatCurrency(bal)}
                    </p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">
                      Net Balance
                    </p>
                  </div>
                  <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
