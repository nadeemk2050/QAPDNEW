import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Banknote, Plus, Trash2, Check, AlertCircle,
  ChevronDown, RefreshCw, Hash, Calendar, FileText, Copy, X, Loader2,
  Receipt, Send, ArrowUpDown, Share2
} from 'lucide-react'
import { listAccounts, listLedgers, addPayment, addContra, checkRefNo, getVoucher, updateVoucher } from '../api'
import SearchableSelect from './SearchableSelect'

const VOUCHER_TYPES = {
  payment: { label: 'Payment', icon: Send, color: 'text-red-600', bg: 'bg-red-100', border: 'border-red-200' },
  receipt: { label: 'Receipt', icon: Receipt, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
  contra: { label: 'Contra', icon: ArrowUpDown, color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200' },
}

function todayStr() {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0)
}

function generateRefNo(type) {
  const prefix = type === 'payment' ? 'PMT' : type === 'receipt' ? 'RCT' : 'CTR'
  const ts = Date.now().toString(36).toUpperCase().slice(-6)
  return `${prefix}-${ts}`
}

function saveVoucherToLocalCache(type, data) {
  try {
    const cacheKey = 'quickaccpro_cached_transactions'
    const cachedRaw = localStorage.getItem(cacheKey)
    const transactions = cachedRaw ? JSON.parse(cachedRaw) : []

    const fromAccount = data.accountsList?.find(a => a.id === data.accountId)
    const toAccount = data.accountsList?.find(a => a.id === data.toAccountId)

    const newTx = {
      id: Math.random().toString(36).substring(7),
      type: 'payments',
      date: data.date || new Date().toISOString().split('T')[0],
      refNo: data.refNo || '',
      amount: Number(data.amount || 0),
      description: data.narration || '',
      accountName: fromAccount?.name || 'Cash/Bank',
      partyName: toAccount?.name || data.partyName || '',
      drName: type === 'contra' ? (toAccount?.name || '') : (type === 'receipt' ? (fromAccount?.name || '') : (data.partyName || '')),
      crName: type === 'contra' ? (fromAccount?.name || '') : (type === 'receipt' ? (data.partyName || '') : (fromAccount?.name || '')),
      subType: type === 'contra' ? 'contra' : (type === 'receipt' ? 'in' : 'out'),
      status: 'active',
      syncTimestamp: Date.now()
    }

    transactions.unshift(newTx)
    localStorage.setItem(cacheKey, JSON.stringify(transactions.slice(0, 300)))
  } catch (e) {
    console.error('Failed to cache voucher locally:', e)
  }
}

import { shareVoucherText, shareVoucherPdf } from '../utils/voucherPdf'

export default function CashierVoucher({ subUser }) {
  const { voucherType, voucherId } = useParams()
  const isEditMode = !!voucherId
  const navigate = useNavigate()
  const [type, setType] = useState(voucherType || 'payment')
  const cfg = VOUCHER_TYPES[type] || VOUCHER_TYPES.payment
  const Icon = cfg.icon

  const [accounts, setAccounts] = useState([])
  const [ledgers, setLedgers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [date, setDate] = useState(todayStr())
  const [refNo, setRefNo] = useState(generateRefNo(type))
  const [refManuallySet, setRefManuallySet] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [narration, setNarration] = useState('')
  const [refNoExists, setRefNoExists] = useState(false)
  const [refNoChecking, setRefNoChecking] = useState(false)

  // Payment/Receipt rows
  const [rows, setRows] = useState([{ ledgerId: '', ledgerCollection: 'parties', amount: '', narration: '' }])

  const originalRefNo = useRef('')

  // Sync type with route param in create mode
  useEffect(() => {
    if (!isEditMode && voucherType) {
      setType(voucherType)
    }
  }, [voucherType, isEditMode])

  // Load accounts & ledgers from cache first, then optionally from API
  const syncAccountLedgers = useCallback(async () => {
    setError('')
    try {
      const [accData, ledData] = await Promise.all([
        listAccounts(),
        listLedgers()
      ])
      const accountsList = accData.accounts || []
      const ledgersList = ledData.ledgers || []
      setAccounts(accountsList)
      setLedgers(ledgersList)
      localStorage.setItem('quickaccpro_cached_accounts', JSON.stringify(accountsList))
      localStorage.setItem('quickaccpro_cached_ledgers', JSON.stringify(ledgersList))
      return { accountsList, ledgersList }
    } catch (err) {
      setError(err.message || 'Failed to sync accounts & ledgers')
      return null
    }
  }, [])

  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true)
    setError('')

    // Load from cache first
    let accountsList = []
    let ledgersList = []
    try {
      const cachedAcc = localStorage.getItem('quickaccpro_cached_accounts')
      const cachedLed = localStorage.getItem('quickaccpro_cached_ledgers')
      if (cachedAcc) accountsList = JSON.parse(cachedAcc)
      if (cachedLed) ledgersList = JSON.parse(cachedLed)
    } catch (e) {}

    // If no cache, do a fresh fetch
    if (accountsList.length === 0 || ledgersList.length === 0) {
      const result = await syncAccountLedgers()
      if (result) {
        accountsList = result.accountsList
        ledgersList = result.ledgersList
      }
    } else {
      setAccounts(accountsList)
      setLedgers(ledgersList)
    }

    // Edit mode — also fetch voucher details
    if (isEditMode) {
      try {
        const res = await getVoucher(voucherId)
        if (res.success && res.voucher) {
          const v = res.voucher
          const resolvedType = v.type === 'in' ? 'receipt' : v.type === 'out' ? 'payment' : v.type
          setType(resolvedType)
          setDate(v.date)
          setRefNo(v.refNo)
          originalRefNo.current = v.refNo
          setAccountId(v.accountId)
          setNarration(v.narration || '')

          if (resolvedType === 'contra') {
            setToAccountId(v.toAccountId || v.splits?.[0]?.targetId || v.splits?.[0]?.id || v.payments?.[0]?.ledgerId || '')
            const targetAmt = v.totalAmount || v.amount || v.splits?.[0]?.amount || v.payments?.[0]?.amount || 0
            setRows([{ ledgerId: '', ledgerCollection: 'parties', amount: String(targetAmt), narration: '' }])
          } else {
            setRows(v.payments.map(p => ({
              ledgerId: p.ledgerId,
              ledgerCollection: p.ledgerCollection,
              amount: String(p.amount),
              narration: p.narration || ''
            })))
          }
        }
      } catch (err) {
        setError(err.message || 'Failed to load voucher')
      }
    }

    setLoading(false)
  }

  // Check refNo uniqueness
  const checkTimer = useRef(null)
  const handleRefNoChange = useCallback((val) => {
    setRefNo(val)
    setRefManuallySet(true)
    if (checkTimer.current) clearTimeout(checkTimer.current)
    if (!val.trim()) { setRefNoExists(false); return }
    setRefNoChecking(true)
    checkTimer.current = setTimeout(async () => {
      try {
        const res = await checkRefNo(val.trim())
        setRefNoExists(res.exists)
      } catch { setRefNoExists(false) }
      setRefNoChecking(false)
    }, 500)
  }, [])

  // Reset form and refNo when type changes (but NOT in edit mode — data comes from loadData)
  useEffect(() => {
    if (isEditMode) return;
    if (!refManuallySet) {
      setRefNo(generateRefNo(type))
    }
    setRows([{ ledgerId: '', ledgerCollection: 'parties', amount: '', narration: '' }])
    setAccountId('')
    setToAccountId('')
    setNarration('')
    setError('')
    setSuccess('')
  }, [type]) // eslint-disable-line react-hooks/exhaustive-deps

  // Row management for payment/receipt
  const addRow = useCallback(() => {
    setRows(prev => [...prev, { ledgerId: '', ledgerCollection: 'parties', amount: '', narration: '' }])
  }, [])

  const removeRow = useCallback((idx) => {
    setRows(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }, [])

  const updateRow = useCallback((idx, field, value) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }, [])

  const totalAmount = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0)

  // Find ledger name by ID
  const getLedgerName = (id) => {
    if (!id) return ''
    const l = ledgers.find(l => l.id === id)
    return l?.name || ''
  }

  const getAccountName = (id) => {
    if (!id) return ''
    const a = accounts.find(a => a.id === id)
    return a?.name || a?.accountName || ''
  }

  // Submit
  const handleSubmit = async (shareFormat = 'none') => {
    setError('')
    setSuccess('')

    // Validation
    if (refNoExists && refNo !== originalRefNo.current) {
      setError(`Reference number "${refNo}" already exists. Please use a unique ref no.`)
      return
    }

    if (type === 'contra') {
      if (!accountId) { setError('Please select source account'); return }
      if (!toAccountId) { setError('Please select target account'); return }
      if (accountId === toAccountId) { setError('Source and target accounts must be different'); return }
      if (!totalAmount || totalAmount <= 0) { setError('Please enter amount'); return }
    } else {
      if (!accountId) { setError('Please select cash/bank account'); return }
      const validRows = rows.filter(r => r.ledgerId && parseFloat(r.amount) > 0)
      if (validRows.length === 0) { setError('Please add at least one ledger entry with amount'); return }
    }

    // Capture share data before reset/navigation
    const shareData = {
      type,
      refNo,
      date,
      narration,
      totalAmount,
      accountName: getAccountName(accountId),
      fromAccountName: getAccountName(accountId),
      toAccountName: getAccountName(toAccountId),
      rows: type === 'contra' ? [] : rows
        .filter(r => r.ledgerId && parseFloat(r.amount) > 0)
        .map(r => ({
          ledgerName: getLedgerName(r.ledgerId),
          amount: parseFloat(r.amount),
          narration: r.narration
        }))
    }

    setSaving(true)
    try {
      if (isEditMode) {
        if (type === 'contra') {
          const fromAccName = getAccountName(accountId)
          const toAccName = getAccountName(toAccountId)
          await updateVoucher(voucherId, {
            accountId,
            fromAccountId: accountId,
            toAccountId,
            amount: totalAmount,
            date,
            narration,
            refNo,
            type: 'contra',
            accountName: fromAccName,
            toAccountName: toAccName,
            drName: toAccName,
            crName: fromAccName,
            partyName: `${fromAccName} → ${toAccName}`,
            subUserId: subUser?.id,
            userName: subUser?.name
          })
        } else {
          const payments = rows
            .filter(r => r.ledgerId && parseFloat(r.amount) > 0)
            .map(r => {
              const ledgerInfo = ledgers.find(l => l.id === r.ledgerId)
              return {
                ledgerId: r.ledgerId,
                ledgerCollection: ledgerInfo?.collection || 'parties',
                amount: parseFloat(r.amount),
                narration: r.narration || narration,
                category: 'normal'
              }
            })

          const paymentType = type === 'receipt' ? 'in' : 'out'
          
          await updateVoucher(voucherId, {
            accountId,
            payments,
            date,
            narration,
            refNo,
            type: paymentType,
            subUserId: subUser?.id,
            userName: subUser?.name
          })
        }

        setSuccess(`${cfg.label} voucher updated successfully!`)
        if (shareFormat === 'text') {
          await shareVoucherText(shareData)
        } else if (shareFormat === 'pdf') {
          await shareVoucherPdf(shareData)
        }
        setTimeout(() => {
          navigate(-1)
        }, 1500)
      } else {
        if (type === 'contra') {
          await addContra({
            fromAccountId: accountId,
            toAccountId: toAccountId,
            amount: totalAmount,
            date,
            narration,
            refNo,
            accountName: getAccountName(accountId),
            toAccountName: getAccountName(toAccountId),
            partyName: `${getAccountName(accountId)} → ${getAccountName(toAccountId)}`
          })
          saveVoucherToLocalCache('contra', { accountId, toAccountId, amount: totalAmount, date, narration, refNo, accountsList: accounts })
        } else {
          const payments = rows
            .filter(r => r.ledgerId && parseFloat(r.amount) > 0)
            .map(r => {
              const ledgerInfo = ledgers.find(l => l.id === r.ledgerId)
              return {
                ledgerId: r.ledgerId,
                ledgerName: ledgerInfo?.name || 'Unknown',
                ledgerCollection: ledgerInfo?.collection || 'parties',
                amount: parseFloat(r.amount),
                narration: r.narration || narration,
                category: 'normal'
              }
            })

          const paymentType = type === 'receipt' ? 'in' : 'out'
          const firstPayment = payments[0]
          const accName = getAccountName(accountId)

          await addPayment({
            accountId,
            payments,
            date,
            narration,
            refNo,
            type: paymentType,
            accountName: accName,
            partyId: firstPayment?.ledgerId || '',
            partyName: firstPayment?.ledgerName || ''
          })

          // Cache each individual ledger payment row
          payments.forEach(p => {
            saveVoucherToLocalCache(type, {
              accountId,
              date,
              narration: p.narration || narration,
              refNo,
              amount: p.amount,
              partyName: ledgers.find(l => l.id === p.ledgerId)?.name || 'Party',
              accountsList: accounts
            })
          })
        }

        setSuccess(`${cfg.label} voucher saved successfully!`)
        if (shareFormat === 'text') {
          await shareVoucherText(shareData)
        } else if (shareFormat === 'pdf') {
          await shareVoucherPdf(shareData)
        }
        
        // Reset form for next entry
        setTimeout(() => {
          setRefNo(generateRefNo(type))
          setRefManuallySet(false)
          setRefNoExists(false)
          setNarration('')
          setRows([{ ledgerId: '', ledgerCollection: 'parties', amount: '', narration: '' }])
          setSuccess('')
        }, 1500)
      }
    } catch (err) {
      setError(err.message || 'Failed to save voucher')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 mt-4">Loading accounts & ledgers...</p>
      </div>
    )
  }

  // Options without live balances — reduces need for frequent re-fetches
  const accountOptions = accounts.map(acc => ({
    id: acc.id,
    name: acc.name || acc.accountName,
    details: ''
  }))

  const toAccountOptions = accounts
    .filter(a => a.id !== accountId)
    .map(acc => ({
      id: acc.id,
      name: acc.name || acc.accountName,
      details: ''
    }))

  const ledgerOptions = ledgers.map(l => ({
    id: l.id,
    name: l.name,
    details: `(${l.collection})`
  }))

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/dashboard')} className="p-2 -ml-2 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <div className={`w-10 h-10 rounded-xl ${cfg.bg} flex items-center justify-center`}>
          <Icon size={20} className={cfg.color} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">{isEditMode ? 'Edit ' : ''}{cfg.label} Voucher</h1>
          <p className="text-xs text-slate-500">{isEditMode ? 'Update existing entry' : 'Quick cash entry'}</p>
        </div>
      </div>

      {/* Error / Success */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <Check size={16} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Voucher Type Tabs */}
      {!isEditMode && (
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(VOUCHER_TYPES).map(([key, v]) => {
            const TabIcon = v.icon
            return (
              <button
                key={key}
                onClick={() => navigate(`/voucher/${key}`)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all
                  ${type === key
                    ? `${v.bg} ${v.color} shadow-sm`
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                  }`}
              >
                <TabIcon size={16} />
                {v.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Voucher Form */}
      <div className={`card border-2 ${cfg.border} space-y-4`}>
        {/* Top bar: Ref No + Date */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              <Hash size={10} className="inline mr-0.5" />
              REF NO
            </label>
            <div className="relative">
              <input
                type="text"
                value={refNo}
                onChange={e => handleRefNoChange(e.target.value)}
                className={`input-field text-xs font-mono pr-8 ${refNoExists ? 'border-red-400 focus:border-red-500' : ''}`}
                placeholder="Unique ref no"
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {refNoChecking ? (
                  <Loader2 size={14} className="animate-spin text-slate-400" />
                ) : refNoExists ? (
                  <X size={14} className="text-red-500" />
                ) : refNo ? (
                  <Check size={14} className="text-green-500" />
                ) : null}
              </div>
            </div>
            {refNoExists && (
              <p className="text-[9px] text-red-500 mt-0.5 font-medium">Already exists!</p>
            )}
          </div>
          <div className="w-36">
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              <Calendar size={10} className="inline mr-0.5" />
              DATE
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="input-field text-xs"
            />
          </div>
        </div>


        {/* Account selection (cash/bank source) */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              {type === 'contra' ? 'FROM ACCOUNT' : 'CASH / BANK ACCOUNT'}
            </label>
            <button
              onClick={syncAccountLedgers}
              className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
              title="Sync latest accounts & ledgers list from main database"
            >
              <RefreshCw size={10} />
              Sync Accounts
            </button>
          </div>
          <SearchableSelect
            options={accountOptions}
            value={accountId}
            onChange={setAccountId}
            placeholder="— Select Account —"
            favoriteKey="quickaccpro_fav_accounts"
            recentKey="quickaccpro_rec_accounts"
          />
        </div>

        {/* Contra: To Account */}
        {type === 'contra' && (
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              TO ACCOUNT (TRANSFER TO)
            </label>
            <SearchableSelect
              options={toAccountOptions}
              value={toAccountId}
              onChange={setToAccountId}
              placeholder="— Select Transfer Account —"
              favoriteKey="quickaccpro_fav_accounts"
              recentKey="quickaccpro_rec_accounts"
            />
          </div>
        )}

        {/* Contra: Amount input */}
        {type === 'contra' && (
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              AMOUNT (DHS)
            </label>
            <input
              type="number"
              value={rows[0]?.amount || ''}
              onChange={e => updateRow(0, 'amount', e.target.value)}
              onWheel={e => e.target.blur()}
              className="input-field text-sm font-semibold"
              placeholder="0.00"
              step="0.001"
              min="0"
            />
          </div>
        )}

        {/* Payment / Receipt: Multiple ledger rows */}
        {type !== 'contra' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                <FileText size={10} className="inline mr-0.5" />
                ACCOUNT / PARTICULARS
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={syncAccountLedgers}
                  className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                  title="Sync latest accounts & ledgers list from main database"
                >
                  <RefreshCw size={10} />
                  Sync
                </button>
                <button
                  onClick={addRow}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <Plus size={12} />
                  ADD
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <SearchableSelect
                        options={ledgerOptions}
                        value={row.ledgerId}
                        onChange={val => updateRow(idx, 'ledgerId', val)}
                        placeholder="— Select Ledger —"
                        favoriteKey="quickaccpro_fav_ledgers"
                        recentKey="quickaccpro_rec_ledgers"
                        className="mb-1.5"
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <input
                            type="number"
                            value={row.amount}
                            onChange={e => updateRow(idx, 'amount', e.target.value)}
                            onWheel={e => e.target.blur()}
                            className="input-field text-sm font-semibold"
                            placeholder="0.00"
                            step="0.001"
                            min="0"
                          />
                        </div>
                        <button
                          onClick={() => removeRow(idx)}
                          className="p-2.5 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                          disabled={rows.length === 1}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={row.narration}
                    onChange={e => updateRow(idx, 'narration', e.target.value)}
                    className="input-field text-xs"
                    placeholder="Particulars (optional)"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Total Amount Display */}
        <div className="bg-slate-900 rounded-xl p-4 text-center">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            {type === 'contra' ? 'TRANSFER AMOUNT' : 'TOTAL AMOUNT'}
          </p>
          <p className="text-3xl font-bold text-white font-mono tracking-tight">
            {formatCurrency(totalAmount)}
          </p>
        </div>

        {/* Narration */}
        <div>
          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
            <FileText size={10} className="inline mr-0.5" />
            NARRATION
          </label>
          <input
            type="text"
            value={narration}
            onChange={e => setNarration(e.target.value)}
            className="input-field text-sm"
            placeholder={type === 'contra' ? 'Contra narration...' : 'Voucher narration...'}
          />
        </div>

        {/* Submit Buttons */}
        <div className="space-y-2">
          <button
            onClick={() => handleSubmit('none')}
            disabled={saving}
            className="w-full flex items-center justify-center gap-1.5 py-3.5 bg-slate-800 hover:bg-slate-900 
                       text-white font-bold rounded-xl transition-all active:scale-[0.98] 
                       disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-200 text-xs uppercase tracking-wider font-semibold"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Check size={16} />
                Save Only (No Share)
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleSubmit('text')}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 py-3 bg-blue-600 hover:bg-blue-700 
                         text-white font-bold rounded-xl transition-all active:scale-[0.98] 
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-100 text-[11px] uppercase tracking-wider font-semibold"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <Share2 size={14} />
                  Save & Share Text
                </>
              )}
            </button>

            <button
              onClick={() => handleSubmit('pdf')}
              disabled={saving}
              className="flex items-center justify-center gap-1.5 py-3 bg-indigo-600 hover:bg-indigo-700 
                         text-white font-bold rounded-xl transition-all active:scale-[0.98] 
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-100 text-[11px] uppercase tracking-wider font-semibold"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  <FileText size={14} />
                  Save & Share PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick help */}
      <p className="text-center text-[10px] text-slate-400">
        All entries sync to AccountsPro in real-time via API
      </p>
    </div>
  )
}
