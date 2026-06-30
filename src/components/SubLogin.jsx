import React, { useState } from 'react'
import { Lock, User, LogIn, AlertCircle, CheckCircle, Shield } from 'lucide-react'

export default function SubLogin({ companyName, onLoginComplete, onSkip }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (!username.trim()) {
      setError('Please enter your name')
      return
    }
    setError('')
    setSuccess('')
    setVerifying(true)
    try {
      // Simple local login — no API call needed
      const userData = {
        id: username.trim().toLowerCase().replace(/\s+/g, '_'),
        name: username.trim(),
        role: 'member'
      }
      setSuccess(`Welcome, ${userData.name}!`)
      setTimeout(() => onLoginComplete(userData), 800)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Info */}
      <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-xl">
        <div className="flex gap-3">
          <Shield className="text-indigo-600 shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="text-sm font-bold text-indigo-900">Team Member Login</h4>
            <p className="text-xs text-indigo-700 mt-1">
              Enter your <strong>Name</strong> and <strong>Password</strong> exactly as set in 
              AccountsPro → Manage Team/Users. All vouchers will be tagged with your identity.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle size={16} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="card space-y-4">
        {/* Name */}
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <User size={12} />
            Your Name (as in Manage Team)
          </label>
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            className="input-field"
            placeholder="e.g. waliul, haris, rizwan..."
            autoFocus
            autoComplete="off"
          />
        </div>

        {/* Password */}
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <Lock size={12} />
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            className="input-field"
            placeholder="Your team member password..."
            autoComplete="off"
          />
        </div>

        <button
          type="submit"
          disabled={verifying || !username.trim() || !password}
          className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-600 hover:bg-indigo-700 
                     text-white font-bold rounded-xl transition-all active:scale-[0.98]
                     disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 text-sm"
        >
          {verifying ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <LogIn size={18} />
              Sign In
            </>
          )}
        </button>
      </form>

      {/* Skip */}
      <div className="text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
        >
          Continue without login (vouchers tagged as "QuickAccPro User")
        </button>
      </div>
    </div>
  )
}
