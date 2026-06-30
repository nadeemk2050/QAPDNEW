import React, { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate, BrowserRouter } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import { setCurrentCompanyId, getCurrentCompanyId, getMasterDB } from './localDB'
import Layout from './components/Layout'
import WelcomeScreen from './components/WelcomeScreen'
import CompanySelect from './components/CompanySelect'
import SubLogin from './components/SubLogin'
import Dashboard from './components/Dashboard'
import DaybookLive from './components/DaybookLive'
import Profile from './components/Profile'
import CashierVoucher from './components/CashierVoucher'
import CashBankRegister from './components/CashBankRegister'
import VoucherRegister from './components/VoucherRegister'

// ─── Storage helpers ─────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  SUB_USER: 'qapd_sub_user',
}

function getStoredSubUser() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SUB_USER)) }
  catch { return null }
}
function setStoredSubUser(data) {
  if (data) localStorage.setItem(STORAGE_KEYS.SUB_USER, JSON.stringify(data))
  else localStorage.removeItem(STORAGE_KEYS.SUB_USER)
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [company, setCompany] = useState(null)
  const [subUser, setSubUserState] = useState(getStoredSubUser())
  const [showSubLogin, setShowSubLogin] = useState(false)
  const [dbReady, setDbReady] = useState(false)
  const navigate = useNavigate()

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setAuthLoading(false)
    })
    return () => unsub()
  }, [])

  // Initialize master DB on mount
  useEffect(() => {
    getMasterDB().then(() => setDbReady(true)).catch(console.error)
  }, [])

  // Check stored company on mount
  useEffect(() => {
    const storedCompanyId = getCurrentCompanyId()
    if (storedCompanyId) {
      getMasterDB().then(async (masterDB) => {
        try {
          const doc = await masterDB.company_registry.findOne({ selector: { id: storedCompanyId } }).exec()
          if (doc) setCompany(doc.toJSON())
        } catch {}
      })
    }
  }, [])

  const handleFirebaseLogin = useCallback((firebaseUser) => {
    setUser(firebaseUser)
  }, [])

  const handleSelectCompany = useCallback((companyData) => {
    setCompany(companyData)
    // Show sub-login after company selection
    const existing = getStoredSubUser()
    if (!existing) {
      setShowSubLogin(true)
    } else {
      setSubUserState(existing)
      navigate('/dashboard')
    }
  }, [navigate])

  const handleSubLoginComplete = useCallback((userData) => {
    setSubUserState(userData)
    setStoredSubUser(userData)
    setShowSubLogin(false)
    navigate('/dashboard')
  }, [navigate])

  const handleSubLoginSkip = useCallback(() => {
    const generic = { id: 'qapd_user', name: 'Quick User', role: 'user' }
    setStoredSubUser(generic)
    setSubUserState(generic)
    setShowSubLogin(false)
    navigate('/dashboard')
  }, [navigate])

  const handleLogout = useCallback(async () => {
    setCompany(null)
    setSubUserState(null)
    setStoredSubUser(null)
    setShowSubLogin(false)
    setCurrentCompanyId(null)
    try { await signOut(auth) } catch {}
    navigate('/')
  }, [navigate])

  const refreshCompany = useCallback(() => {
    // Reload company data from local DB
    const storedId = getCurrentCompanyId()
    if (storedId) {
      getMasterDB().then(async (masterDB) => {
        try {
          const doc = await masterDB.company_registry.findOne({ selector: { id: storedId } }).exec()
          if (doc) setCompany(doc.toJSON())
        } catch {}
      })
    }
  }, [])

  // Loading state
  if (authLoading || !dbReady) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-indigo-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-indigo-300 text-sm font-medium">Loading QAPD...</p>
        </div>
      </div>
    )
  }

  // Not logged in → Show Welcome/Auth screen
  if (!user) {
    return <WelcomeScreen onLogin={handleFirebaseLogin} />
  }

  // Logged in but no company selected → Show Company Selection
  if (!company) {
    return (
      <CompanySelect
        user={user}
        onSelectCompany={handleSelectCompany}
        onLogout={handleLogout}
      />
    )
  }

  // Show sub-login after company is selected
  if (showSubLogin) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-2xl shadow-indigo-500/30">
              <span className="text-white font-bold text-xl">QP</span>
            </div>
            <h1 className="text-xl font-bold text-white">QAPD</h1>
            <p className="text-indigo-300 text-sm mt-0.5">{company?.name || company?.companyName}</p>
          </div>
          <SubLogin
            companyName={company?.name || company?.companyName}
            onLoginComplete={handleSubLoginComplete}
            onSkip={handleSubLoginSkip}
          />
        </div>
      </div>
    )
  }

  // Main App
  return (
    <Layout company={company} subUser={subUser} onLogout={handleLogout}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard company={company} subUser={subUser} />} />
        <Route path="/daybook" element={<DaybookLive subUser={subUser} />} />
        <Route path="/register" element={<CashBankRegister />} />
        <Route path="/register/payment" element={<VoucherRegister />} />
        <Route path="/register/receipt" element={<VoucherRegister />} />
        <Route path="/register/contra" element={<VoucherRegister />} />
        <Route path="/profile" element={<Profile company={company} subUser={subUser} onRefresh={refreshCompany} />} />
        <Route path="/voucher/edit/:voucherId" element={<CashierVoucher subUser={subUser} />} />
        <Route path="/voucher/:voucherType" element={<CashierVoucher subUser={subUser} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}
