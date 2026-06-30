import React, { useState, useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { getStoredApiKey, setStoredApiKey, getStoredCompany, setStoredCompany, clearAllStorage, validateApiKey, getStoredSubUser, setStoredSubUser } from './api'
import Layout from './components/Layout'
import ApiKeyLogin from './components/ApiKeyLogin'
import SubLogin from './components/SubLogin'
import Dashboard from './components/Dashboard'
import DaybookLive from './components/DaybookLive'
import Profile from './components/Profile'
import CashierVoucher from './components/CashierVoucher'
import CashBankRegister from './components/CashBankRegister'

export default function App() {
  const [apiKey, setApiKeyState] = useState(getStoredApiKey())
  const [company, setCompanyState] = useState(getStoredCompany())
  const [subUser, setSubUserState] = useState(getStoredSubUser())
  const [showSubLogin, setShowSubLogin] = useState(false)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const setCompanyData = useCallback((data) => {
    setCompanyState({ name: data.companyName, id: data.companyId, license: data.license, teamCount: data.teamCount })
    setStoredCompany({ name: data.companyName, id: data.companyId, license: data.license, teamCount: data.teamCount })
  }, [])

  // On mount, validate stored API key silently
  useEffect(() => {
    if (apiKey) {
      validateStoredKey(apiKey)
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validateStoredKey = async (key) => {
    try {
      const data = await validateApiKey(key)
      // Check if data returned a generic company name, and if so, fallback to stored company name
      const stored = getStoredCompany()
      if (stored?.name && (!data.companyName || data.companyName === 'AccountsPro Company' || data.companyName === 'AccountsPro')) {
        data.companyName = stored.name
      }
      setCompanyData(data)
    } catch {
      setApiKeyState(null)
      setStoredApiKey(null)
      setCompanyState(null)
      setStoredCompany(null)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = useCallback(async (key) => {
    const data = await validateApiKey(key)
    // Check if data returned a generic company name, and if so, fallback to stored company name
    const stored = getStoredCompany()
    if (stored?.name && (!data.companyName || data.companyName === 'AccountsPro Company' || data.companyName === 'AccountsPro')) {
      data.companyName = stored.name
    }
    setApiKeyState(key)
    setStoredApiKey(key)
    setCompanyData(data)
    // Show sub-login after API key validation
    const existing = getStoredSubUser()
    if (!existing) {
      setShowSubLogin(true)
    } else {
      setSubUserState(existing)
      navigate('/dashboard')
    }
  }, [navigate, setCompanyData])

  const handleSubLoginComplete = useCallback((userData) => {
    setSubUserState(userData)
    setShowSubLogin(false)
    navigate('/dashboard')
  }, [navigate])

  const handleSubLoginSkip = useCallback(() => {
    const generic = { id: 'quickaccpro', name: 'QuickAccPro User', role: 'api' }
    setStoredSubUser(generic)
    setSubUserState(generic)
    setShowSubLogin(false)
    navigate('/dashboard')
  }, [navigate])

  const handleLogout = useCallback(() => {
    setApiKeyState(null)
    setCompanyState(null)
    setSubUserState(null)
    clearAllStorage()
    navigate('/')
  }, [navigate])

  const refreshCompany = useCallback(async () => {
    try {
      const key = getStoredApiKey()
      if (key) {
        const data = await validateApiKey(key)
        setCompanyData(data)
      }
    } catch {}
  }, [setCompanyData])

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-indigo-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-indigo-300 text-sm font-medium">Loading QuickAccPro...</p>
        </div>
      </div>
    )
  }

  if (!apiKey) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
        <ApiKeyLogin onLogin={handleLogin} />
      </div>
    )
  }

  // Show sub-login screen after API key is validated
  if (showSubLogin) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center mx-auto mb-3 shadow-2xl shadow-indigo-500/30">
              <span className="text-white font-bold text-xl">QP</span>
            </div>
            <h1 className="text-xl font-bold text-white">QuickAccPro</h1>
            <p className="text-indigo-300 text-sm mt-0.5">{company?.name}</p>
          </div>
          <SubLogin 
            companyName={company?.name}
            onLoginComplete={handleSubLoginComplete} 
            onSkip={handleSubLoginSkip} 
          />
        </div>
      </div>
    )
  }

  return (
    <Layout company={company} subUser={subUser} onLogout={handleLogout}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard company={company} subUser={subUser} />} />
        <Route path="/daybook" element={<DaybookLive />} />
        <Route path="/cash-bank-register" element={<CashBankRegister />} />
        <Route path="/profile" element={<Profile company={company} subUser={subUser} onRefresh={refreshCompany} />} />
        <Route path="/voucher/:voucherType" element={<CashierVoucher subUser={subUser} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}
