import React, { useState } from 'react'
import { Key, ArrowRight, AlertCircle, CheckCircle, Shield, Zap } from 'lucide-react'

export default function ApiKeyLogin({ onLogin }) {
  const [inputKey, setInputKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const key = inputKey.trim()
    if (!key) {
      setError('Please enter your API key')
      return
    }

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      await onLogin(key)
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to validate API key. Please check and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Logo */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500 flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-indigo-500/30">
          <Zap size={32} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          QuickAccPro <span className="text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-md border border-white/10 font-mono align-middle ml-1">v1.5</span>
        </h1>
        <p className="text-indigo-300 text-sm mt-1">Lightweight companion for AccountsPro</p>
      </div>

      {/* Welcome card */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/10 mb-4">
        <div className="flex items-start gap-3 mb-4">
          <Shield size={20} className="text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-white font-semibold text-sm">Connect with API Key</h2>
            <p className="text-indigo-200 text-xs mt-1">
              Enter your API key from AccountsPro to access your company data instantly.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1.5">
              API Key
            </label>
            <input
              type="text"
              value={inputKey}
              onChange={(e) => { setInputKey(e.target.value); setError('') }}
              placeholder="Paste your secret API key here..."
              className="w-full px-4 py-3.5 bg-white/5 border-2 border-white/10 rounded-xl text-sm text-white 
                         placeholder:text-indigo-300/40 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 
                         outline-none transition-all font-mono tracking-wider"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-xs">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <CheckCircle size={16} className="text-green-400 shrink-0" />
              <p className="text-green-300 text-xs">Connected successfully! Redirecting...</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !inputKey.trim()}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-500 hover:bg-indigo-400 
                       text-white font-semibold rounded-xl transition-all active:scale-[0.98] 
                       disabled:opacity-40 disabled:cursor-not-allowed shadow-xl shadow-indigo-500/20"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <Key size={18} />
                <span>Connect</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Hint */}
      <p className="text-center text-[10px] text-indigo-400/60">
        Get your API key from AccountsPro → API & Widget Access
      </p>
    </div>
  )
}
