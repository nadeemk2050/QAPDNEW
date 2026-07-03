import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Banknote, ChevronDown, ChevronUp,
  Send, Receipt, ArrowUpDown, X, TrendingUp
} from 'lucide-react'
import { db } from '../firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { getCurrentCompanyId, getDB } from '../localDB'
import { getDaybookAll } from '../api'


export default function Dashboard({ company, subUser }) {
  const navigate = useNavigate()
  
  // Collapse states
  const [vouchersExpanded, setVouchersExpanded] = useState(true)
  const [registersExpanded, setRegistersExpanded] = useState(true)
  
  // Accounts & Favorites State
  const [accounts, setAccounts] = useState([])
  const [showSelector, setShowSelector] = useState(false)
  const [favorites, setFavorites] = useState(() => {
    const raw = localStorage.getItem('qapd_favorite_accounts')
    return raw ? JSON.parse(raw) : []
  })


  useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    const companyId = getCurrentCompanyId()
    if (!companyId) return

    try {
      // Read from local RxDB via Firestore shim
      const q = query(collection(db, 'accounts'), where('userId', '==', companyId))
      const snap = await getDocs(q)
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      
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
    } catch (e) {
      console.warn('[QAPD] Failed to load accounts:', e)
    }
  }

  const addFavorite = (accId) => {
    if (favorites.length >= 3) return
    const updated = [...favorites, accId]
    setFavorites(updated)
    localStorage.setItem('qapd_favorite_accounts', JSON.stringify(updated))
    setShowSelector(false)
  }

  const removeFavorite = (accId) => {
    const updated = favorites.filter(id => id !== accId)
    setFavorites(updated)
    localStorage.setItem('qapd_favorite_accounts', JSON.stringify(updated))
  }

  const formatCurrency = (val) => {
    const num = Number(val || 0)
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  }

  return (
    <div className="space-y-7">
      {/* Favorite Balances Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-600 animate-pulse" />
            <span>Favorite Balances</span>
          </h2>
          {favorites.length < 3 && !showSelector && (
            <button
              onClick={() => setShowSelector(true)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              + Add Balance Tab
            </button>
          )}
        </div>

        {/* Favorite Account Selector Dropdown/Grid */}
        {showSelector && (
          <div className="card p-4 border-2 border-indigo-100 bg-indigo-50/40 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900">Add Cash / Bank Balance Tab</span>
              <button 
                onClick={() => setShowSelector(false)} 
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {accounts
                .filter(a => !favorites.includes(a.id))
                .map(a => (
                  <button
                    key={a.id}
                    onClick={() => addFavorite(a.id)}
                    className="p-3 bg-white border border-slate-200 rounded-xl text-left text-xs font-bold text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all truncate"
                  >
                    {a.name || 'Unknown'}
                  </button>
                ))}
              {accounts.filter(a => !favorites.includes(a.id)).length === 0 && (
                <p className="text-xs text-slate-500 italic col-span-3 text-center py-2">No more accounts available</p>
              )}
            </div>
          </div>
        )}

        {/* Balance Display Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {favorites.map(favId => {
            const acc = accounts.find(a => a.id === favId)
            const bal = acc ? Number(acc.balance || 0) : 0
            return (
              <div 
                key={favId} 
                className="card relative pr-10 hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all active:scale-[0.99]"
                onClick={(e) => {
                  if (e.target.closest('button')) return
                  if (acc?.name) {
                    navigate(`/daybook?accountName=${encodeURIComponent(acc.name)}`)
                  }
                }}
              >
                <button
                  onClick={() => removeFavorite(favId)}
                  className="absolute right-2.5 top-2.5 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors z-10"
                  title="Remove"
                >
                  <X size={14} />
                </button>
                <p className="text-2xl font-bold text-slate-800 font-mono tracking-tight">
                  {formatCurrency(bal)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1.5 font-bold uppercase tracking-wider truncate">
                  {acc?.name || 'Loading...'}
                </p>
              </div>
            )
          })}
          
          {favorites.length === 0 && (
            <div 
              onClick={() => setShowSelector(true)}
              className="col-span-3 card py-8 text-center border-dashed border-2 hover:border-indigo-300 hover:bg-slate-50 cursor-pointer flex flex-col items-center justify-center text-slate-400 transition-all"
            >
              <TrendingUp size={24} className="mb-2 text-slate-300" />
              <p className="text-xs font-bold text-slate-500">No favorite balance tabs added</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Click here to select up to 3 cash or bank accounts</p>
            </div>
          )}
        </div>
      </div>

      {/* Clickable Cashier Vouchers Section */}
      <div>
        <h2 
          onClick={() => setVouchersExpanded(!vouchersExpanded)}
          className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors select-none"
        >
          <Banknote size={16} className="text-indigo-600" />
          <span>Cashier Vouchers</span>
          {vouchersExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </h2>
        
        {vouchersExpanded && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => navigate('/voucher/payment')}
              className="card flex flex-col items-center gap-2 py-4 hover:shadow-md hover:border-red-200 transition-all group text-center"
            >
              <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                <Send size={20} className="text-red-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-700">PAYMENT</p>
            </button>
            <button
              onClick={() => navigate('/voucher/receipt')}
              className="card flex flex-col items-center gap-2 py-4 hover:shadow-md hover:border-green-200 transition-all group text-center"
            >
              <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <Receipt size={20} className="text-green-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-700">RECEIPT</p>
            </button>
            <button
              onClick={() => navigate('/voucher/contra')}
              className="card flex flex-col items-center gap-2 py-4 hover:shadow-md hover:border-blue-200 transition-all group text-center"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <ArrowUpDown size={20} className="text-blue-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-700">CONTRA</p>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
