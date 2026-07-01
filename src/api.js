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
  syncToCloud(companyId, 'payments', voucherId, docData)

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
  syncToCloud(companyId, 'payments', voucherId, docData)

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
  const docRef = doc(db, 'payments', voucherId)
  await setDoc(docRef, { ...data, updatedAt: Date.now() }, { merge: true })
  return { success: true }
}

export async function deleteVoucher(voucherId, collection) {
  const docRef = doc(db, collection || 'payments', voucherId)
  await updateDoc(docRef, { status: 'deleted', deletedAt: Date.now() })
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
