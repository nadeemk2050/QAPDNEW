import React, { useState } from 'react'
import { 
  Building2, Key, Shield, Mail, User, Calendar, 
  RefreshCw, CheckCircle, AlertCircle, Copy, Check,
  Users, Hash, Clock, FileText
} from 'lucide-react'
import SystemLogs from './SystemLogs'

export default function Profile({ company, subUser, onRefresh }) {
  const [copied, setCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showLogs, setShowLogs] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const copyToClip = (text) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (ts) => {
    if (!ts) return 'N/A'
    try {
      const d = typeof ts === 'number' ? new Date(ts) : new Date(ts.seconds ? ts.seconds * 1000 : ts)
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    } catch { return 'N/A' }
  }

  const license = company?.license

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Company Profile</h1>
          <p className="text-sm text-slate-500 mt-1">Your AccountsPro company information</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary text-xs"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Company Info Card */}
      <div className="card">
        <div className="flex items-start gap-4 mb-4 pb-4 border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
            <Building2 size={28} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-800">{company?.profile?.name || company?.name || 'AccountsPro Company'}</h3>
            <p className="text-xs text-slate-500 mt-1">Company ID: <span className="font-mono text-slate-600">{company?.id || '—'}</span></p>
            
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Users size={13} />
                <span>{company?.teamCount || 0} team member{(company?.teamCount || 0) !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <CheckCircle size={13} className="text-green-500" />
                <span>Connected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Company Profile Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Company Name</label>
            <p className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5">{company?.profile?.name || company?.name || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">TRN Number</label>
            <p className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5">{company?.profile?.trn || '—'}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Full Address</label>
            <p className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5 whitespace-pre-line min-h-[40px]">{company?.profile?.address || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Phone</label>
            <p className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5">{company?.profile?.phone || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Email</label>
            <p className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5">{company?.profile?.email || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">City</label>
            <p className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5">{company?.profile?.city || '—'}</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Country</label>
            <p className="text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-2.5">{company?.profile?.country || '—'}</p>
          </div>
        </div>
      </div>

      {/* License Information */}
      <div className="card border-2 border-indigo-50/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
          <h2 className="text-sm font-bold text-indigo-900 tracking-wider uppercase">License Status</h2>
          <span className={`px-2.5 py-1 text-[10px] font-bold rounded border ${
            license?.status === 'active' || license?.status === 'approved' 
              ? 'bg-green-50 text-green-700 border-green-200' 
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {license?.status === 'active' || license?.status === 'approved' ? 'ACTIVE' : (license?.status || 'INACTIVE').toUpperCase()}
          </span>
        </div>

        {license ? (
          <div className="divide-y divide-slate-100">
            {/* Serial Key */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2 text-slate-600 font-medium">
                <Key size={14} className="text-indigo-500" />
                <span className="text-xs uppercase tracking-wider">Serial Key</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-indigo-950">{license.serialKey || '—'}</span>
                <button
                  onClick={() => copyToClip(license.serialKey)}
                  className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                  title="Copy serial key"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Starts On */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2 text-slate-600 font-medium">
                <Calendar size={14} className="text-indigo-500" />
                <span className="text-xs uppercase tracking-wider">Starts On</span>
              </div>
              <span className="text-sm font-bold text-slate-800">{formatDate(license.activatedAt || license.createdAt)}</span>
            </div>

            {/* Expires On */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2 text-slate-600 font-medium">
                <Calendar size={14} className="text-indigo-500" />
                <span className="text-xs uppercase tracking-wider">Expires On</span>
              </div>
              <span className="text-sm font-bold text-slate-800">{formatDate(license.expiresAt)}</span>
            </div>

            {/* Days Left */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2 text-slate-600 font-medium">
                <RefreshCw size={14} className="text-indigo-500" />
                <span className="text-xs uppercase tracking-wider">Days Left</span>
              </div>
              <span className="text-base font-black text-emerald-600">
                {(() => {
                  if (!license.expiresAt) return '—'
                  const expires = typeof license.expiresAt === 'number' ? license.expiresAt : new Date(license.expiresAt).getTime()
                  const left = Math.max(0, Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24)))
                  return `${left} days`
                })()}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 text-center">
            <Key size={32} className="text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No license information available</p>
            <p className="text-xs text-slate-400 mt-1">
              License details appear when logging in via serial key, or if your API key is linked to a licensed company.
            </p>
          </div>
        )}
      </div>

      {/* Logged-in User Info */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <User size={18} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-700">Logged-in User</h2>
        </div>
        {subUser ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-600">
                {(subUser.name || 'U')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{subUser.name}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{subUser.role || 'user'}</p>
              </div>
            </div>
            {company?.name && (
              <div className="border-t border-slate-100 pt-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                  Active Company
                </label>
                <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">{company.name}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No user logged in. Vouchers will be tagged as "QuickAccPro User".</p>
        )}
      </div>
      {/* System Log History Card */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-700">System Log History</h2>
              <p className="text-xs text-slate-400 mt-0.5">Watch real-time system log changes</p>
            </div>
          </div>
          <button
            onClick={() => setShowLogs(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all active:scale-[0.98]"
          >
            Open Logs
          </button>
        </div>
      </div>

      {showLogs && (
        <SystemLogs onClose={() => setShowLogs(false)} />
      )}
    </div>
  )
}
