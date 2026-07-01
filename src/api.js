/**
 * QAPD Data Layer — Replaces the old REST API with local Firestore/RxDB operations.
 * All functions match the old names so existing components work without changes.
 */
import { db, cloudDb } from './firebase';
import { collection, query, where, getDocs, addDoc, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getCurrentCompanyId, getDB } from './localDB';

// ─── Storage keys ────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  API_KEY: 'qapd_api_key',
  COMPANY: 'qapd_company',
  SESSION: 'qapd_session',
}

export function getStoredApiKey() { return null }
export function setStoredApiKey(key) {}
export function getStoredCompany() { return null }
export function setStoredCompany(data) {}
export function getStoredSession() { return null }
export function setStoredSession(data) {}
export function getStoredSubUser() {
  try { return JSON.parse(localStorage.getItem('qapd_sub_user')) }
  catch { return null }
}
export function setStoredSubUser(data) {
  if (data) localStorage.setItem('qapd_sub_user', JSON.stringify(data))
  else localStorage.removeItem('qapd_sub_user')
}
export function clearAllStorage() {
  localStorage.removeItem('qapd_api_key')
  localStorage.removeItem('qapd_company')
  sessionStorage.removeItem('qapd_session')
}
export function validateApiKey(key) { throw new Error('API key login disabled — use Firebase Auth') }
export function verifyTeamLogin(name, pwd) { throw new Error('API login disabled — use Firebase Auth') }
export function rebuildLiveRecords() { return { success: true } }

// ─── Accounts & Ledgers ─────────────────────────────────────────────────────

export async function listAccounts() {
  try {
    const companyId = getCurrentCompanyId()
    if (!companyId) return { accounts: [] }
    const q = query(collection(db, 'accounts'), where('userId', '==', companyId))
    const snap = await getDocs(q)
    return { accounts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }
  } catch (e) {
    console.warn('[QAPD] listAccounts failed:', e.message)
    return { accounts: [] }
  }
}

export async function listLedgers() {
  const companyId = getCurrentCompanyId()
  if (!companyId) return { ledgers: [] }
  try {
    const collections = ['parties', 'accounts', 'expenses', 'income_accounts']
    const results = []
    for (const col of collections) {
      const q = query(collection(db, col), where('userId', '==', companyId))
      const snap = await getDocs(q)
      snap.docs.forEach(d => {
        const data = d.data()
        results.push({
          id: d.id,
          name: data.name || data.accountName || 'Unknown',
          collection: col,
          type: data.type || col
        })
      })
    }
    return { ledgers: results }
  } catch (e) {
    console.warn('[QAPD] listLedgers failed:', e.message)
    return { ledgers: [] }
  }
}

// Helper to resolve Contra names from account ID if missing in document fields
function resolveContraNames(data, ledgerList) {
  let drName = data.toAccountName || data.drName || ''
  let crName = data.accountName || data.crName || data.fromAccountName || ''
  
  if ((!drName || !crName) && ledgerList && ledgerList.length > 0) {
    const resolvedDrId = data.toAccountId || data.partyId
    const resolvedCrId = data.fromAccountId || data.accountId
    
    if (!drName && resolvedDrId) {
      drName = ledgerList.find(a => a.id === resolvedDrId)?.name || ''
    }
    if (!crName && resolvedCrId) {
      crName = ledgerList.find(a => a.id === resolvedCrId)?.name || ''
    }
  }
  return { drName, crName }
}

function resolveLedgerName(id, ledgerList) {
  if (!id) return ''
  const ledger = ledgerList.find(l => l.id === id)
  return ledger ? ledger.name : ''
}

// ─── Transactions / Daybook ─────────────────────────────────────────────────

export async function listTransactions(params = {}) {
  const companyId = getCurrentCompanyId()
  if (!companyId) return { transactions: [], total: 0 }
  try {
    const companyDB = await getDB()
    let ledgerList = []
    if (companyDB?.offline_records) {
      const ledgerDocs = await companyDB.offline_records.find({
        selector: { collectionName: { $in: ['parties', 'accounts', 'expenses', 'income_accounts'] } }
      }).exec()
      ledgerList = ledgerDocs.map(d => {
        const r = d.toJSON()
        const inner = r.data || {}
        return {
          id: r.id,
          name: inner.name || inner.accountName || ''
        }
      })
    }

    const collections = ['payments', 'invoices', 'journal_vouchers', 'stock_journals']
    const allTxns = []
    for (const col of collections) {
      const q = query(collection(db, col), where('userId', '==', companyId))
      const snap = await getDocs(q)
      snap.docs.forEach(d => {
        const data = d.data()
        if (data.deleted || data.status === 'deleted') return
        const typeMap = { out: 'Payment', in: 'Receipt', contra: 'Contra', purchase: 'Purchase', sales: 'Sales', journal: 'Journal', manufacturing: 'Manufacturing', stock_journal: 'Stock Journal' }
        const typeLower = (data.type || '').toLowerCase()
        const subType = (typeLower === 'out' || typeLower === 'payment') ? 'payment' : (typeLower === 'in' || typeLower === 'receipt') ? 'receipt' : typeLower === 'contra' ? 'contra' : typeLower || ''
        
        let drName = data.drName || ''
        let crName = data.crName || ''
        if (col === 'payments') {
          if (subType === 'payment') {
            drName = data.drName || data.partyName || (data.payments?.[0]?.ledgerName) || ''
            if (!drName) {
              const firstPaymentId = data.payments?.[0]?.ledgerId || data.partyId || data.expenseId || data.incomeAccountId
              drName = resolveLedgerName(firstPaymentId, ledgerList)
            }
            crName = data.crName || data.accountName || ''
            if (!crName) {
              crName = resolveLedgerName(data.accountId, ledgerList)
            }
          } else if (subType === 'receipt') {
            drName = data.drName || data.accountName || ''
            if (!drName) {
              drName = resolveLedgerName(data.accountId, ledgerList)
            }
            crName = data.crName || data.partyName || (data.payments?.[0]?.ledgerName) || ''
            if (!crName) {
              const firstPaymentId = data.payments?.[0]?.ledgerId || data.partyId || data.expenseId || data.incomeAccountId
              crName = resolveLedgerName(firstPaymentId, ledgerList)
            }
          } else if (subType === 'contra') {
            drName = data.drName || data.toAccountName || ''
            crName = data.crName || data.accountName || data.fromAccountName || ''
            if (!drName || !crName) {
              const resolved = resolveContraNames(data, ledgerList)
              drName = drName || resolved.drName
              crName = crName || resolved.crName
            }
            console.log('[QAPD] listTransactions Contra resolved data:', { drName, crName, data })
          }
        }

        allTxns.push({
          id: d.id,
          refNo: data.refNo || '',
          date: data.date || '',
          type: col,
          subType,
          voucherType: typeMap[data.type] || col,
          collection: col,
          amount: Number(data.totalAmount || data.amount || 0),
          narration: data.narration || data.description || '',
          accountName: data.accountName || '',
          partyName: data.partyName || (data.payments?.[0]?.ledgerName) || '',
          drName,
          crName,
          syncTimestamp: data.lastModifiedAt?.seconds ? data.lastModifiedAt.seconds * 1000 : Date.now(),
          status: data.status || 'active'
        })
      })
    }
    // Sort by date desc
    allTxns.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return { transactions: allTxns, total: allTxns.length }
  } catch (e) {
    console.warn('[QAPD] listTransactions failed:', e.message)
    return { transactions: [], total: 0 }
  }
}

// ─── Voucher CRUD ────────────────────────────────────────────────────────────

export async function addPayment(data) {
  const companyId = getCurrentCompanyId()
  if (!companyId) throw new Error('No company selected')

  // Calculate totalAmount from payments array
  const totalAmount = (data.payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

  const docData = {
    ...data,
    totalAmount,
    amount: totalAmount,
    userId: companyId,
    createdAt: Date.now(),
    status: 'active',
    // ACCPRO resolves party name via findName(partyId) — store the first ledger ID
    partyId: data.partyId || (data.payments?.[0]?.ledgerId) || '',
    partyName: data.partyName || (data.payments?.[0]?.ledgerName) || ''
  }

  // 1. Save to local RxDB via rxfs shim
  const colRef = collection(db, 'payments')
  const docRef = await addDoc(colRef, docData)
  const voucherId = docRef.id

  // Clear daybook cache so fresh data loads
  try { localStorage.removeItem('quickaccpro_cached_transactions') } catch {}

  // 2. Push to cloud (real Firestore) for cross-device sync
  await syncToCloud(companyId, 'payments', voucherId, docData)
  await writeLog('created', docData)

  return { success: true, id: voucherId }
}

export async function addContra(data) {
  const companyId = getCurrentCompanyId()
  if (!companyId) throw new Error('No company selected')

  const totalAmount = parseFloat(data.amount || 0)

  const docData = {
    ...data,
    totalAmount,
    amount: totalAmount,
    type: 'contra',
    userId: companyId,
    createdAt: Date.now(),
    status: 'active',
    partyName: data.partyName || ''
  }

  // 1. Save to local RxDB
  const colRef = collection(db, 'payments')
  const docRef = await addDoc(colRef, docData)
  const voucherId = docRef.id

  // Clear daybook cache so fresh data loads
  try { localStorage.removeItem('quickaccpro_cached_transactions') } catch {}

  // 2. Push to cloud
  await syncToCloud(companyId, 'payments', voucherId, docData)
  await writeLog('created', docData)

  return { success: true, id: voucherId }
}

// Helper: sync a document to real Firestore cloud — matches ACCPRO's live sync structure
async function syncToCloud(companyId, collectionName, docId, docData) {
  try {
    const { collection: c, doc: d, setDoc: s, getDoc: g } = await import('@firebase/firestore');
    const livePath = `companies_live/${companyId}/records`;
    const now = Date.now();
    const cloudDocRef = d(c(cloudDb, livePath), docId);

    // Write document matching ACCPRO's exact format
    await s(cloudDocRef, {
      id: docId,
      collectionName,
      data: docData,           // business data (same as ACCPRO's RxDB data field)
      timestamp: now,
      lastSync: now,
      syncTimestamp: now       // ⬅️ CRITICAL: ACCPRO pulls docs where syncTimestamp > lastPullTs
    }, { merge: true });

    // Verify the write by reading it back
    const verify = await g(cloudDocRef);
    console.log(`[QAPD] ✅ Synced to cloud: companies_live/${companyId}/records/${docId} (exists: ${verify.exists()})`);
  } catch (e) {
    console.warn('[QAPD] Cloud sync error:', e.message);
  }
}

export async function checkRefNo(refNo) {
  const companyId = getCurrentCompanyId()
  if (!companyId) return { exists: false }
  try {
    const collections = ['payments', 'invoices', 'journal_vouchers', 'stock_journals']
    for (const col of collections) {
      const q = query(collection(db, col), where('userId', '==', companyId), where('refNo', '==', refNo))
      const snap = await getDocs(q)
      if (!snap.empty) return { exists: true }
    }
  } catch {}
  return { exists: false }
}

export async function getVoucher(voucherId) {
  try {
    const collections = ['payments', 'invoices', 'journal_vouchers', 'stock_journals']
    for (const col of collections) {
      const docRef = doc(db, col, voucherId)
      const snap = await getDocs(query(collection(db, col)))
      const found = snap.docs.find(d => d.id === voucherId)
      if (found) {
        return { success: true, voucher: { id: found.id, ...found.data() } }
      }
    }
  } catch {}
  return { success: false }
}

export async function updateVoucher(voucherId, data) {
  // Fetch old doc to get old amount and refNo/type for logging
  let oldVoucher = null
  try {
    const res = await getVoucher(voucherId)
    if (res.success) oldVoucher = res.voucher
  } catch (e) {}

  const docRef = doc(db, 'payments', voucherId)
  const updatedData = { ...data, updatedAt: Date.now() }
  await setDoc(docRef, updatedData, { merge: true })

  // Sync to cloud
  const companyId = getCurrentCompanyId()
  if (companyId) {
    await syncToCloud(companyId, 'payments', voucherId, updatedData)
    if (oldVoucher) {
      await writeLog('edited', updatedData, oldVoucher.totalAmount || oldVoucher.amount || 0)
    }
  }

  // Clear daybook cache
  try { localStorage.removeItem('quickaccpro_cached_transactions') } catch {}

  return { success: true }
}

export async function deleteVoucher(voucherId, colName) {
  let oldVoucher = null
  try {
    const res = await getVoucher(voucherId)
    if (res.success) oldVoucher = res.voucher
  } catch (e) {}

  const collectionName = colName || 'payments'
  const docRef = doc(db, collectionName, voucherId)
  const deletedData = { status: 'deleted', deletedAt: Date.now(), deleted: true }
  await updateDoc(docRef, deletedData)

  const companyId = getCurrentCompanyId()
  if (companyId) {
    // Merge status with old document data to sync complete updated doc to cloud
    const fullDoc = oldVoucher ? { ...oldVoucher, ...deletedData } : deletedData
    await syncToCloud(companyId, collectionName, voucherId, fullDoc)
    if (oldVoucher) {
      await writeLog('deleted', oldVoucher, oldVoucher.totalAmount || oldVoucher.amount || 0)
    }
  }

  // Clear daybook cache
  try { localStorage.removeItem('quickaccpro_cached_transactions') } catch {}

  return { success: true }
}

// ─── Daybook helpers ─────────────────────────────────────────────────────────

export async function getDaybookAll(params = {}) {
  return listTransactions(params)
}

export async function getAccountLedger(accountId, params = {}) {
  const companyId = getCurrentCompanyId()
  if (!companyId) return { transactions: [], total: 0 }
  try {
    const companyDB = await getDB()
    let ledgerList = []
    if (companyDB?.offline_records) {
      const ledgerDocs = await companyDB.offline_records.find({
        selector: { collectionName: { $in: ['parties', 'accounts', 'expenses', 'income_accounts'] } }
      }).exec()
      ledgerList = ledgerDocs.map(d => {
        const r = d.toJSON()
        const inner = r.data || {}
        return {
          id: r.id,
          name: inner.name || inner.accountName || ''
        }
      })
    }

    const allTxns = []
    const collections = ['payments', 'invoices', 'journal_vouchers', 'stock_journals']
    for (const col of collections) {
      const q = query(collection(db, col), where('userId', '==', companyId))
      const snap = await getDocs(q)
      snap.docs.forEach(d => {
        const data = d.data()
        if (data.deleted || data.status === 'deleted') return
        
        const accLower = (accountId || '').trim().toLowerCase()
        const isMatch = data.accountId === accountId || 
                        data.partyId === accountId || 
                        data.id === accountId || 
                        data.toAccountId === accountId ||
                        (data.accountName || '').trim().toLowerCase() === accLower ||
                        (data.partyName || '').trim().toLowerCase() === accLower ||
                        (data.toAccountName || '').trim().toLowerCase() === accLower;

        // Match if accountId, partyId, or name matches
        if (isMatch) {
          const typeLower = (data.type || '').toLowerCase()
          const subType = (typeLower === 'out' || typeLower === 'payment') ? 'payment' : (typeLower === 'in' || typeLower === 'receipt') ? 'receipt' : typeLower === 'contra' ? 'contra' : typeLower || ''
          
          let drName = data.drName || ''
          let crName = data.crName || ''
          if (col === 'payments') {
            if (subType === 'payment') {
              drName = data.drName || data.partyName || (data.payments?.[0]?.ledgerName) || ''
              if (!drName) {
                const firstPaymentId = data.payments?.[0]?.ledgerId || data.partyId || data.expenseId || data.incomeAccountId
                drName = resolveLedgerName(firstPaymentId, ledgerList)
              }
              crName = data.crName || data.accountName || ''
              if (!crName) {
                crName = resolveLedgerName(data.accountId, ledgerList)
              }
            } else if (subType === 'receipt') {
              drName = data.drName || data.accountName || ''
              if (!drName) {
                drName = resolveLedgerName(data.accountId, ledgerList)
              }
              crName = data.crName || data.partyName || (data.payments?.[0]?.ledgerName) || ''
              if (!crName) {
                const firstPaymentId = data.payments?.[0]?.ledgerId || data.partyId || data.expenseId || data.incomeAccountId
                crName = resolveLedgerName(firstPaymentId, ledgerList)
              }
            } else if (subType === 'contra') {
              drName = data.drName || data.toAccountName || ''
              crName = data.crName || data.accountName || data.fromAccountName || ''
              if (!drName || !crName) {
                const resolved = resolveContraNames(data, ledgerList)
                drName = drName || resolved.drName
                crName = crName || resolved.crName
              }
              console.log('[QAPD] getAccountLedger Contra resolved data:', { drName, crName, data })
            }
          }

          allTxns.push({
            id: d.id,
            refNo: data.refNo || '',
            date: data.date || '',
            type: col,
            subType,
            amount: Number(data.totalAmount || data.amount || 0),
            narration: data.narration || data.description || '',
            accountName: data.accountName || '',
            partyName: data.partyName || (data.payments?.[0]?.ledgerName) || '',
            drName,
            crName,
            collection: col
          })
        }
      })
    }
    allTxns.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return { transactions: allTxns, total: allTxns.length }
  } catch (e) {
    return { transactions: [], total: 0 }
  }
}

export async function listContra(params = {}) {
  const companyId = getCurrentCompanyId()
  if (!companyId) return { transactions: [], total: 0 }
  try {
    const q = query(collection(db, 'payments'), where('userId', '==', companyId), where('type', '==', 'contra'))
    const snap = await getDocs(q)
    const txns = snap.docs.map(d => {
      const data = d.data()
      return {
        id: d.id,
        refNo: data.refNo || '',
        date: data.date || '',
        type: 'payments',
        subType: 'contra',
        amount: Number(data.totalAmount || data.amount || 0),
        narration: data.narration || '',
        accountName: data.accountName || '',
        toAccountName: data.toAccountName || '',
        drName: data.toAccountName || '',
        crName: data.accountName || '',
        fromAccount: data.accountId || '',
        toAccount: data.toAccountId || '',
        collection: 'payments'
      }
    })
    txns.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    return { transactions: txns, total: txns.length }
  } catch (e) {
    return { transactions: [], total: 0 }
  }
}

// ─── System Logs ─────────────────────────────────────────────────────────────

export async function writeLog(action, voucher, oldValue = null) {
  const companyId = getCurrentCompanyId()
  if (!companyId) return

  const subUser = getStoredSubUser()
  const userStr = subUser ? `${subUser.username || subUser.name || 'User'} (${subUser.email || ''})` : 'QAPD App'

  const docName = `Voucher: ${voucher.type || 'payment'} (${voucher.refNo || '—'})`
  
  const logData = {
    docName,
    refNo: voucher.refNo || '—',
    voucherDate: voucher.date || '',
    oldValue: oldValue ? formatCurrencyForLog(oldValue) : '—',
    newValue: formatCurrencyForLog(voucher.totalAmount || voucher.amount || 0),
    userEmail: userStr,
    status: action.toUpperCase(), // 'CREATED', 'EDITED', 'DELETED'
    timestamp: Date.now(),
    date: new Date().toISOString().split('T')[0]
  }

  // 1. Save log to local database (logs collection)
  const logId = 'log_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now()
  const colRef = collection(db, 'logs')
  await setDoc(doc(colRef, logId), logData)

  // 2. Sync to cloud instantly
  await syncToCloud(companyId, 'logs', logId, logData)
}

function formatCurrencyForLog(val) {
  const num = Number(val || 0)
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export async function listLogs() {
  const companyId = getCurrentCompanyId()
  if (!companyId) return { logs: [] }
  try {
    const companyDB = await getDB()
    if (companyDB?.offline_records) {
      const docs = await companyDB.offline_records.find({
        selector: { collectionName: 'logs' }
      }).exec()
      
      const results = docs.map(d => {
        const r = d.toJSON()
        return {
          id: r.id,
          ...(r.data || {}),
          timestamp: r.timestamp || r.data?.timestamp || Date.now()
        }
      })
      
      // Sort newest logs first
      results.sort((a, b) => b.timestamp - a.timestamp)
      return { logs: results }
    }
  } catch (e) {
    console.error(e)
  }
  return { logs: [] }
}
