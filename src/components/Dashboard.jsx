import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Banknote, ChevronDown, ChevronUp,
  Minus, Plus, ArrowUpDown, Building2, X, TrendingUp
} from 'lucide-react'
import { db } from '../firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { getCurrentCompanyId } from '../localDB'


export default function Dashboard({ company, subUser }) {
  const navigate = useNavigate()

  const [vouchersExpanded, setVouchersExpanded] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [showSelector, setShowSelector] = useState(false)
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('qapd_favorite_accounts') || '[]') }
    catch { return [] }
  })

  useEffect(() => { loadAccounts() }, [])

  const loadAccounts = async () => {
    const companyId = getCurrentCompanyId()
    if (!companyId) return
    try {
      const q = query(collection(db, 'accounts'), where('userId', '==', companyId))
      const snap = await getDocs(q)
      setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
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

  return (
    <div className="space-y-7">
      {/* Favorite Accounts � names only, max 3 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-600" />
            <span>Favorite Accounts</span>
          </h2>
          {favorites.length < 3 && !showSelector && (
            <button onClick={() => setShowSelector(true)}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >+ Add Account</button>
          )}
        </div>

        {showSelector && (
          <div className="card p-4 border-2 border-indigo-100 bg-indigo-50/40 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-900">Select Cash / Bank Account</span>
              <button onClick={() => setShowSelector(false)} className="text-xs text-slate-400 hover:text-slate-600 underline">Close</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {accounts.filter(a => !favorites.includes(a.id)).map(a => (
                <button key={a.id} onClick={() => addFavorite(a.id)}
                  className="p-3 bg-white border border-slate-200 rounded-xl text-left text-xs font-bold text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/20 transition-all truncate"
                >{a.name || 'Unknown'}</button>
              ))}
              {accounts.filter(a => !favorites.includes(a.id)).length === 0 && (
                <p className="text-xs text-slate-500 italic col-span-3 text-center py-2">All accounts added</p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {favorites.map(favId => {
            const acc = accounts.find(a => a.id === favId)
            return (
              <div key={favId}
                onClick={() => { if (acc?.name) navigate(`/daybook?accountName=${encodeURIComponent(acc.name)}`) }}
                className="card relative pr-10 hover:shadow-md hover:border-indigo-200 cursor-pointer transition-all active:scale-[0.99] flex items-center gap-3 p-3"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Building2 size={18} />
                </div>
                <p className="text-xs font-bold text-slate-700 truncate flex-1">{acc?.name || 'Loading...'}</p>
                <button onClick={e => { e.stopPropagation(); removeFavorite(favId) }}
                  className="absolute right-2.5 top-2.5 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                ><X size={12} /></button>
              </div>
            )
          })}
          {favorites.length === 0 && (
            <div onClick={() => setShowSelector(true)}
              className="col-span-3 card py-6 text-center border-dashed border-2 hover:border-indigo-300 hover:bg-slate-50 cursor-pointer flex flex-col items-center justify-center text-slate-400 transition-all"
            >
              <TrendingUp size={22} className="mb-1.5 text-slate-300" />
              <p className="text-xs font-bold text-slate-500">No favorites</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Add up to 3 cash/bank accounts</p>
            </div>
          )}
        </div>
      </div>

      {/* Cashier Vouchers */}
      <div>
        <h2 onClick={() => setVouchersExpanded(!vouchersExpanded)}
          className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors select-none"
        >
          <Banknote size={16} className="text-indigo-600" />
          <span>Cashier Vouchers</span>
          {vouchersExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </h2>

        {vouchersExpanded && (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => navigate('/voucher/payment')}
              className="card flex flex-col items-center gap-2 py-5 hover:shadow-md hover:border-red-200 transition-all group text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                <Minus size={28} strokeWidth={4} className="text-red-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-700">PAYMENT</p>
            </button>
            <button onClick={() => navigate('/voucher/receipt')}
              className="card flex flex-col items-center gap-2 py-5 hover:shadow-md hover:border-green-200 transition-all group text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <Plus size={28} strokeWidth={4} className="text-green-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-700">RECEIPT</p>
            </button>
            <button onClick={() => navigate('/voucher/contra')}
              className="card flex flex-col items-center gap-2 py-5 hover:shadow-md hover:border-blue-200 transition-all group text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <ArrowUpDown size={24} className="text-blue-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-700">CONTRA</p>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}