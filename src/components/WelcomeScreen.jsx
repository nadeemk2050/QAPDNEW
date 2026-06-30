import React, { useState } from 'react';
import { LogIn, UserPlus, Key, Shield, Mail, Lock, Eye, EyeOff, X, AlertCircle, Loader2 } from 'lucide-react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

export default function WelcomeScreen({ onLogin }) {
  const [mode, setMode] = useState('welcome'); // welcome | login | register
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      let userCred;
      if (mode === 'login') {
        userCred = await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        userCred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
      onLogin(userCred.user);
    } catch (err) {
      console.error('[QAPD] Auth error:', err.code, err.message);
      const msg = err.code || err.message || 'Authentication failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'login' || mode === 'register') {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
        <div className="w-full max-w-sm">
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-500/30">
                <span className="text-white font-bold text-xl">QP</span>
              </div>
              <h2 className="text-xl font-bold text-white">
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </h2>
              <p className="text-indigo-300 text-xs mt-1">
                {mode === 'login' ? 'Enter your credentials' : 'Register a new account'}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5 mb-4">
                <AlertCircle size={14} className="text-red-400 shrink-0" />
                <span className="text-red-300 text-xs flex-1">{error}</span>
                <button onClick={() => setError('')} className="text-red-400 hover:text-red-300"><X size={12} /></button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleAuth} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">Email</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-indigo-300/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-1">Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-9 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-indigo-300/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-300">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><LogIn size={16} /> {mode === 'login' ? 'Sign In' : 'Create Account'}</>}
              </button>
            </form>

            {/* Toggle mode */}
            <div className="mt-4 text-center">
              <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="text-indigo-400 hover:text-indigo-300 text-xs font-medium transition-colors">
                {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Welcome screen
  return (
    <div className="min-h-dvh flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-indigo-500/30">
          <span className="text-white font-black text-3xl">QP</span>
        </div>

        <h1 className="text-3xl font-black text-white mb-1">QAPD</h1>
        <p className="text-indigo-300 text-sm mb-8">Quick Accounting & Payment Dashboard</p>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => setMode('login')}
            className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 active:scale-[0.98] transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2.5"
          >
            <LogIn size={18} />
            Previously Activated / Sign In
          </button>

          <button
            onClick={() => setMode('register')}
            className="w-full py-3.5 rounded-xl font-bold text-sm bg-white/10 border border-white/20 text-white hover:bg-white/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5"
          >
            <UserPlus size={18} />
            Create New Account
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-indigo-400/50 text-[10px] font-medium uppercase tracking-widest">
            QAPD v1.0 — Quick Accounting
          </p>
        </div>
      </div>
    </div>
  );
}
