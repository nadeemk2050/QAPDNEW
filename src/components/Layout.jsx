import React, { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, BookOpen, UserCircle, LogOut, Menu, X, 
  ChevronRight, Building2, Send, Receipt, ArrowUpDown, Download, RefreshCw,
  Search, ChevronLeft, FileText
} from 'lucide-react'
import SmartDatePicker from './SmartDatePicker'

const formatDate = (dateStr) => {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

const getPageTitle = (pathname) => {
  if (pathname.startsWith('/voucher/payment')) return 'Payment'
  if (pathname.startsWith('/voucher/receipt')) return 'Receipt'
  if (pathname.startsWith('/voucher/contra')) return 'Contra'
  if (pathname.startsWith('/register/payment')) return 'Payment Register'
  if (pathname.startsWith('/register/receipt')) return 'Receipt Register'
  if (pathname.startsWith('/register/contra')) return 'Contra Register'
  if (pathname === '/register') return 'Cash/Bank Register'
  if (pathname === '/daybook') return 'Daybook'
  if (pathname === '/profile') return 'Profile'
  return 'Dashboard'
}

export default function Layout({ company, subUser, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [registerData, setRegisterData] = useState(null)
  const [showInstructionModal, setShowInstructionModal] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const location = useLocation()

  const handleManualSync = async () => {
    // QAPD uses local-first data — no manual sync needed
    alert("QAPD uses automatic local database. Data is synced automatically.")
    setSidebarOpen(false)
  }

  useEffect(() => {
    const handleRegisterActive = (e) => {
      setRegisterData(e.detail)
    }
    window.addEventListener('quickaccpro-register-active', handleRegisterActive)
    return () => {
      window.removeEventListener('quickaccpro-register-active', handleRegisterActive)
    }
  }, [])

  useEffect(() => {
    // Check if app is launched in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true)
    }

    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      console.log('PWA was installed')
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowInstructionModal(true)
      return
    }
    // Show the install prompt
    deferredPrompt.prompt()
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice
    console.log(`User response to the install prompt: ${outcome}`)
    // We've used the prompt, and can't use it again
    setDeferredPrompt(null)
  }

  return (
    <div className="min-h-dvh flex bg-slate-50 flex-col">
      {/* PWA Install Banner */}
      {!isInstalled && deferredPrompt && (
        <div className="bg-indigo-600 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold shadow-inner z-50">
          <div className="flex items-center gap-2">
            <Download size={14} className="animate-bounce" />
            <span>Install QuickAccPro App for standard mobile application experience</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              className="bg-white text-indigo-700 px-3 py-1 rounded-lg text-[11px] font-bold shadow-sm hover:bg-slate-100 active:scale-95 transition-all"
            >
              Install App
            </button>
            <button
              onClick={() => setDeferredPrompt(null)}
              className="p-1 text-indigo-200 hover:text-white"
              aria-label="Dismiss banner"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="min-h-dvh flex bg-slate-50 flex-1">
        {/* Overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-indigo-950 text-white flex flex-col 
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          {/* Logo area */}
          <div className="p-5 border-b border-indigo-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500 flex items-center justify-center font-bold text-sm shrink-0">
                QP
              </div>
              <div className="min-w-0">
                <h1 className="text-sm font-bold tracking-tight">
                  QuickAccPro <span className="text-[9px] bg-indigo-500/50 text-indigo-100 px-1 py-0.5 rounded font-mono ml-1">v1.6</span>
                </h1>
                {company && (
                  <p className="text-[10px] text-indigo-300 truncate max-w-[120px]">{company.name}</p>
                )}
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-indigo-800 text-indigo-200 hover:text-white transition-colors"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto text-[13px]">
            {/* Dashboard */}
            <NavLink
              to="/dashboard"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
              {location.pathname === '/dashboard' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>

            {/* Vouchers Group Header */}
            <div className="pt-3 pb-1 px-4 text-[9px] font-bold text-indigo-400/80 uppercase tracking-widest">
              Vouchers
            </div>

            {/* Payment */}
            <NavLink
              to="/voucher/payment"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <Send size={18} />
              <span>Payment</span>
              {location.pathname === '/voucher/payment' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>

            {/* Receipt */}
            <NavLink
              to="/voucher/receipt"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <Receipt size={18} />
              <span>Receipt</span>
              {location.pathname === '/voucher/receipt' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>

            {/* Contra */}
            <NavLink
              to="/voucher/contra"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <ArrowUpDown size={18} />
              <span>Contra</span>
              {location.pathname === '/voucher/contra' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>

            {/* Reports Group Header */}
            <div className="pt-3 pb-1 px-4 text-[9px] font-bold text-indigo-400/80 uppercase tracking-widest">
              Reports & Account
            </div>

            {/* Daybook Live */}
            <NavLink
              to="/daybook"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <BookOpen size={18} />
              <span>Daybook Live</span>
              {location.pathname === '/daybook' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>

            {/* Cash/Bank Ledgers */}
            <NavLink
              to="/register"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <Building2 size={18} />
              <span>Cash/Bank Ledgers</span>
              {location.pathname === '/register' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>

            {/* Registers Dashboard Group */}
            <div className="pt-3 pb-1 px-4 text-[9px] font-bold text-indigo-400/80 uppercase tracking-widest">
              Registers
            </div>

            <NavLink
              to="/register/payment"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <Send size={18} />
              <span>Payment Register</span>
              {location.pathname === '/register/payment' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>

            <NavLink
              to="/register/receipt"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <Receipt size={18} />
              <span>Receipt Register</span>
              {location.pathname === '/register/receipt' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>

            <NavLink
              to="/register/contra"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <ArrowUpDown size={18} />
              <span>Contra Register</span>
              {location.pathname === '/register/contra' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>



            {/* Profile */}
            <NavLink
              to="/profile"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-800/30' 
                  : 'text-indigo-200 hover:text-white hover:bg-indigo-800/50'
                }
              `}
            >
              <UserCircle size={18} />
              <span>Profile</span>
              {location.pathname === '/profile' && (
                <ChevronRight size={14} className="ml-auto opacity-50" />
              )}
            </NavLink>
          </nav>

          {/* User info + Logout */}
          <div className="p-3 border-t border-indigo-800/50 space-y-2">
            {subUser && (
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                  {(subUser.name || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{subUser.name}</p>
                  <p className="text-[9px] text-indigo-300 uppercase tracking-wider">{subUser.role || 'user'}</p>
                </div>
              </div>
            )}
            {!isInstalled && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium 
                           text-indigo-200 hover:text-white hover:bg-indigo-800/50 transition-all text-left"
              >
                <Download size={18} />
                <span>Install Application</span>
              </button>
            )}
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium 
                         text-indigo-200 hover:text-white hover:bg-indigo-800/50 transition-all text-left"
            >
              <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
              <span>{isSyncing ? 'Syncing...' : 'Database Sync'}</span>
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-sm font-medium 
                         text-indigo-300 hover:text-white hover:bg-red-600/20 transition-all"
            >
              <LogOut size={18} />
              <span>Disconnect</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* App Header */}
          <header className="bg-white border-b border-slate-200 px-4 py-2 sticky top-0 z-30 shadow-sm">
            {/* First row: hamburger, title, stats, search input, actions */}
            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-1.5 -ml-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                  aria-label="Open menu"
                >
                  <Menu size={20} className="text-slate-600" />
                </button>
                
                {registerData ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate">
                      {registerData.accountName}
                    </span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                      VCH: {registerData.vouchersCount}
                    </span>
                    {registerData.currentBalance !== undefined && registerData.currentBalance !== null && (
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${registerData.currentBalance >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                        BAL: {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(registerData.currentBalance || 0))} {registerData.currentBalance >= 0 ? 'Dr' : 'Cr'}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate">
                      {getPageTitle(location.pathname)}
                    </span>
                    {company?.name && (
                      <>
                        <span className="text-slate-300 shrink-0">|</span>
                        <span className="text-[10px] font-bold text-indigo-700 truncate max-w-[120px] uppercase tracking-wide">
                          {company.name}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                {registerData && (
                  <>
                    {/* Search Toggle Icon & Input */}
                    <div className="flex items-center gap-1">
                      {searchVisible && (
                        <input
                          type="text"
                          value={registerData.search || ''}
                          onChange={(e) => window.dispatchEvent(new CustomEvent('quickaccpro-register-search', { detail: e.target.value }))}
                          placeholder="Search..."
                          className="px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 w-28 sm:w-36 animate-in slide-in-from-right-2 duration-150"
                          autoFocus
                        />
                      )}
                      <button
                        onClick={() => setSearchVisible(!searchVisible)}
                        className={`p-1.5 rounded-lg border transition-all ${searchVisible ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                        title="Search"
                      >
                        <Search size={14} />
                      </button>
                    </div>

                    {/* Refresh button */}
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-refresh'))}
                      disabled={registerData.refreshing}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-indigo-600 disabled:opacity-50 transition-all animate-none"
                      title="Refresh"
                    >
                      <RefreshCw size={14} className={registerData.refreshing ? 'animate-spin' : ''} />
                    </button>

                    {/* Download button */}
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-download'))}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition-all"
                      title="Download CSV"
                    >
                      <Download size={14} />
                    </button>

                    {/* PDF button */}
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-pdf-download'))}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-indigo-600 transition-all"
                      title="Download PDF"
                    >
                      <FileText size={14} />
                    </button>
                  </>
                )}

                {!isInstalled && (
                  <button
                    onClick={handleInstallClick}
                    className="flex items-center gap-1.5 py-1.5 px-3 text-[10px] bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold rounded-full shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    <Download size={11} className="animate-bounce" />
                    <span>Install App</span>
                  </button>
                )}
              </div>
            </div>

            {/* Second row: slideable date filters and debit/credit totals */}
            {registerData && (
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-100 overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap w-full">
                {/* DR / CR Totals */}
                <div className="flex items-center gap-1.5 text-[9px] font-extrabold shrink-0 select-none">
                  <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-200">
                    DR: {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(registerData.totalDebit)}
                  </span>
                  <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-200">
                    CR: {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(registerData.totalCredit)}
                  </span>
                </div>

                <span className="text-slate-300 select-none shrink-0">|</span>

                {/* Period buttons */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-set', { detail: 'all' }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${registerData.dateMode === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-set', { detail: 'single' }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${registerData.dateMode === 'single' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    Date
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-set', { detail: 'custom' }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${registerData.dateMode === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    Range
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-set', { detail: 'month' }))}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${registerData.dateMode === 'month' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    Month
                  </button>
                </div>

                {/* Steppers or range limits */}
                {registerData.dateMode === 'single' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-step', { detail: 'prev' }))}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                    >
                      <ChevronLeft size={13} />
                    </button>

                    <SmartDatePicker
                      value={registerData.filterDate}
                      onChange={(val) => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-date', { detail: { type: 'filterDate', value: val } }))}
                      mode="date"
                    />

                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-step', { detail: 'next' }))}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}

                {registerData.dateMode === 'custom' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <SmartDatePicker
                      value={registerData.startDate}
                      onChange={(val) => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-date', { detail: { type: 'startDate', value: val } }))}
                      mode="date"
                    />

                    <span className="text-slate-400 text-[9px] font-bold font-mono shrink-0">to</span>

                    <SmartDatePicker
                      value={registerData.endDate}
                      onChange={(val) => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-date', { detail: { type: 'endDate', value: val } }))}
                      mode="date"
                    />
                  </div>
                )}

                {registerData.dateMode === 'month' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-month-step', { detail: 'prev' }))}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                    >
                      <ChevronLeft size={13} />
                    </button>

                    <SmartDatePicker
                      value={registerData.filterMonth || new Date().toISOString().substring(0, 7)}
                      onChange={(val) => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-date', { detail: { type: 'filterMonth', value: val } }))}
                      mode="month"
                    />

                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('quickaccpro-register-filter-month-step', { detail: 'next' }))}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </header>

          {/* Page content */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-6xl mx-auto w-full">
            {children}
          </main>
        </div>
      </div>

      {/* PWA Instruction Modal */}
      {showInstructionModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-slate-100 text-slate-800 relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowInstructionModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Close instructions"
            >
              <X size={16} />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <Download size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Install QuickAccPro</h3>
              <p className="text-xs text-slate-500 mt-1">To add this application to your home screen, follow these manual steps for your device:</p>
            </div>
            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <span className="font-bold text-indigo-700 block mb-0.5">Android (Chrome)</span>
                <p className="text-slate-600 font-medium">Tap the browser menu button (3 vertical dots), then select <span className="font-bold text-slate-700">"Install app"</span> or <span className="font-bold text-slate-700">"Add to Home screen"</span>.</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <span className="font-bold text-indigo-700 block mb-0.5">iOS / iPhone (Safari)</span>
                <p className="text-slate-600 font-medium">Tap the <span className="font-bold text-slate-700">Share button</span> (box with up arrow) in Safari, scroll down and select <span className="font-bold text-slate-700">"Add to Home Screen"</span>.</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <span className="font-bold text-indigo-700 block mb-0.5">Desktop (Chrome/Edge)</span>
                <p className="text-slate-600 font-medium">Click the <span className="font-bold text-slate-700">Install icon</span> in the right of the address bar, or open browser settings and select <span className="font-bold text-slate-700">"Install QuickAccPro"</span>.</p>
              </div>
            </div>
            <button
              onClick={() => setShowInstructionModal(false)}
              className="w-full btn-primary py-2.5 text-xs font-bold rounded-xl"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
