/**
 * QAPD Data Layer — Replaces the old REST API with local Firestore/RxDB operations.
 * All functions match the old names so existing components work without changes.
 */
import { db, cloudDb } from './firebase';
import { collection, query, where, getDocs, addDoc, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getCurrentCompanyId, getDB } from './localDB';
import { markSelfSynced } from './cloudSync';
import { v4 as uuidv4 } from 'uuid';

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
    const collections = ['parties', 'accounts', 'expenses', 'income_accounts', 'capital_accounts', 'asset_accounts', 'ledgers']
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
  // Dr = TO/receiver, Cr = FROM/giver
  // ACCPRO stores TO account in partyId/partyName, QAPD uses toAccountId/toAccountName
  let drName = data.toAccountName || data.drName || data.payments?.[0]?.ledgerName || 
    (data.splits && data.splits.length > 0 ? (data.splits[0].targetName || data.splits[0].name) : '') || 
    data.partyName || ''  // ← fallback for ACCPRO-style data
  let crName = data.accountName || data.crName || data.fromAccountName || ''

  if ((!drName || !crName) && ledgerList && ledgerList.length > 0) {
    const resolvedDrId = data.toAccountId || data.partyId || data.payments?.[0]?.ledgerId || data.splits?.[0]?.targetId || data.splits?.[0]?.id
    const resolvedCrId = data.fromAccountId || data.accountId

    if (!drName && resolvedDrId) {
      const found = ledgerList.find(a => a.id === resolvedDrId)
      drName = found ? found.name : ''
    }
    if (!crName && resolvedCrId) {
      const found = ledgerList.find(a => a.id === resolvedCrId)
      crName = found ? found.name : ''
    }
  }
  return { drName, crName }
}

function resolveLedgerName(id, ledgerList) {
  if (!id) return ''
  const ledger = ledgerList.find(l => l.id === id)
  return ledger ? ledger.name : ''
}

function resolveSplits(data, colName, ledgerList) {
  const typeLower = (data.type || '').toLowerCase()
  const subType = (typeLower === 'out' || typeLower === 'payment') ? 'payment' : (typeLower === 'in' || typeLower === 'receipt') ? 'receipt' : typeLower === 'contra' ? 'contra' : typeLower || ''

  if (colName === 'journal_vouchers') {
    if (data.rows && Array.isArray(data.rows)) {
      return data.rows.map(r => ({
        targetId: r.id,
        targetName: resolveLedgerName(r.id, ledgerList),
        amount: Number(r.amount || 0),
        type: r.type
      }))
    }
  }

  if (data.splits && Array.isArray(data.splits)) {
    return data.splits.map(s => {
      const targetId = s.targetId || s.id || s.partyId || s.ledgerId || s.accountId || s.expenseId || s.incomeId || s.capitalId || s.assetId
      const defaultType = (subType === 'receipt') ? 'cr' : 'dr'
      return {
        targetId,
        targetName: s.targetName || s.name || s.ledgerName || resolveLedgerName(targetId, ledgerList),
        amount: Number(s.amount || 0),
        type: s.type || defaultType
      }
    })
  }

  if (data.payments && Array.isArray(data.payments)) {
    return data.payments.map(p => {
      const targetId = p.ledgerId || p.id
      const defaultType = (subType === 'receipt') ? 'cr' : 'dr'
      return {
        targetId,
        targetName: p.ledgerName || resolveLedgerName(targetId, ledgerList),
        amount: Number(p.amount || 0),
        type: p.type || defaultType
      }
    })
  }

  return null
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
        selector: { collectionName: { $in: ['parties', 'accounts', 'expenses', 'income_accounts', 'capital_accounts', 'asset_accounts', 'ledgers'] } }
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
        if (data.deleted || data.status === 'deleted' || data.isDeleted) return
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
            drName = data.toAccountName || data.drName || data.partyName || ''
            crName = data.accountName || data.crName || data.fromAccountName || ''
            if (!drName || !crName) {
              const resolved = resolveContraNames(data, ledgerList)
              drName = drName || resolved.drName
              crName = crName || resolved.crName
            }
          }
        } else if (col === 'journal_vouchers') {
          if (data.isMulti && data.rows && data.rows.length > 0) {
            const drRows = data.rows.filter(r => r.type === 'dr')
            const crRows = data.rows.filter(r => r.type === 'cr')
            if (drRows.length > 1) {
              drName = 'Multiple'
            } else if (drRows.length === 1) {
              drName = resolveLedgerName(drRows[0].id, ledgerList)
            }
            if (crRows.length > 1) {
              crName = 'Multiple'
            } else if (crRows.length === 1) {
              crName = resolveLedgerName(crRows[0].id, ledgerList)
            }
          } else {
            drName = data.drName || resolveLedgerName(data.drId, ledgerList) || ''
            crName = data.crName || resolveLedgerName(data.crId, ledgerList) || ''
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
          accountId: data.accountId || '',
          partyId: data.partyId || '',
          toAccountId: data.toAccountId || '',
          fromAccountId: data.fromAccountId || '',
          drId: data.drId || '',
          crId: data.crId || '',
          partyName: col === 'journal_vouchers' ? `${drName || '—'} / ${crName || '—'}` : (subType === 'contra' ? `${crName || '—'} → ${drName || '—'}` : (data.partyName || (data.payments?.[0]?.ledgerName) || '')),
          drName,
          crName,
          splits: resolveSplits(data, col, ledgerList),
          isMulti: data.isMulti || false,
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
  markSelfSynced(companyId, voucherId)
  await writeLog('created', docData)

  return { success: true, id: voucherId }
}

export async function addContra(data) {
  const companyId = getCurrentCompanyId()
  if (!companyId) throw new Error('No company selected')

  const totalAmount = parseFloat(data.amount || 0)

  const docData = {
    // Spread incoming data (has fromAccountId, toAccountId, accountName, toAccountName, ...)
    ...data,
    totalAmount,
    amount: totalAmount,
    type: 'contra',
    userId: companyId,
    createdAt: Date.now(),
    status: 'active',
    // ── FROM account (payer/giver) ──
    accountId: data.fromAccountId || data.accountId || '',
    fromAccountId: data.fromAccountId || data.accountId || '',
    accountName: data.accountName || data.fromAccountName || '',
    crName: data.accountName || data.fromAccountName || '',
    // ── TO account (receiver) ──
    toAccountId: data.toAccountId || '',
    toAccountName: data.toAccountName || '',
    drName: data.toAccountName || '',
    // ACCPRO expects TO/receiver account in partyId/partyName
    partyId: data.toAccountId || data.partyId || '',
    partyName: data.toAccountName || data.partyName || '',
    // ACCPRO also reads the payments array to identify transaction parties
    payments: [
      {
        ledgerId: data.toAccountId || '',
        ledgerName: data.toAccountName || '',
        amount: totalAmount,
        type: 'dr',
        narration: data.narration || ''
      }
    ]
  }

  // 1. Save to local RxDB
  const colRef = collection(db, 'payments')
  const docRef = await addDoc(colRef, docData)
  const voucherId = docRef.id

  // Clear daybook cache so fresh data loads
  try { localStorage.removeItem('quickaccpro_cached_transactions') } catch {}

  // 2. Push to cloud
  await syncToCloud(companyId, 'payments', voucherId, docData)
  markSelfSynced(companyId, voucherId)
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

    const isDeleted = docData && (docData.deleted || docData.isDeleted || docData.status === 'DELETED' || docData.status === 'deleted');

    // Write document matching ACCPRO's exact format
    const writeData = {
      id: docId,
      collectionName,
      data: docData,           // business data (same as ACCPRO's RxDB data field)
      timestamp: now,
      lastSync: now,
      syncTimestamp: now       // ⬅️ CRITICAL: ACCPRO pulls docs where syncTimestamp > lastPullTs
    };

    if (isDeleted) {
      writeData.deleted = true;
      writeData.isDeleted = true;
      writeData.status = 'DELETED';
    }

    await s(cloudDocRef, writeData, { merge: true });

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
        return { success: true, voucher: { id: found.id, collectionName: col, ...found.data() } }
      }
    }
  } catch {}
  return { success: false }
}

export async function updateVoucher(voucherId, data) {
  // Fetch old doc to get old amount and refNo/type for logging
  let oldVoucher = null
  let colName = 'payments'
  try {
    const res = await getVoucher(voucherId)
    if (res.success) {
      oldVoucher = res.voucher
      colName = res.collectionName || colName
    }
  } catch (e) {}

  // Recalculate totalAmount from payments array if present, otherwise fallback to provided amount fields
  let totalAmount = parseFloat(data.totalAmount || data.amount || 0)
  if (data.payments && Array.isArray(data.payments)) {
    totalAmount = data.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  }

  const docRef = doc(db, colName, voucherId)
  const updatedData = { 
    ...data, 
    amount: totalAmount, 
    totalAmount: totalAmount, 
    updatedAt: Date.now() 
  }
  await setDoc(docRef, updatedData, { merge: true })

  // Sync to cloud
  const companyId = getCurrentCompanyId()
  if (companyId) {
    // Retrieve fully merged local document to ensure all fields (including userId) are synced
    const fullDocRes = await getVoucher(voucherId)
    const fullDoc = fullDocRes.success ? fullDocRes.voucher : { ...oldVoucher, ...updatedData }
    
    // Strip metadata from the nested data object
    const { id: _, collectionName: __, ...syncDocData } = fullDoc
    
    await syncToCloud(companyId, colName, voucherId, syncDocData)
    markSelfSynced(companyId, voucherId)
    await writeLog('edited', syncDocData, oldVoucher?.totalAmount || oldVoucher?.amount || 0)
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

  const collectionName = colName || oldVoucher?.collectionName || 'payments'
  const docRef = doc(db, collectionName, voucherId)
  const deletedData = { status: 'DELETED', deletedAt: Date.now(), deleted: true, isDeleted: true }
  await updateDoc(docRef, deletedData)

  const companyId = getCurrentCompanyId()
  if (companyId) {
    // ⭐ Step 1: Sync deleted status via syncToCloud (same pattern as addPayment)
    const fullDoc = oldVoucher ? { ...oldVoucher, ...deletedData } : deletedData
    
    // Strip metadata from the nested data object
    const { id: _, collectionName: __, ...syncDocData } = fullDoc
    
    await syncToCloud(companyId, collectionName, voucherId, syncDocData)
    markSelfSynced(companyId, voucherId)

    // ⭐ Step 2: ACCPRO's liveSync processes deletions by detecting the status: 'deleted' / deleted: true
    //    fields on the synced records. We keep the cloud document with these fields intact
    //    so offline or polling devices can fetch the deleted status when they sync.
    /*
    try {
      const { collection: c, doc: d, deleteDoc: del } = await import('@firebase/firestore');
      const cloudDocRef = d(c(cloudDb, `companies_live/${companyId}/records`), voucherId);
      await del(cloudDocRef);
      console.log(`[QAPD] ✅ Cloud doc removed: ${voucherId}`);
    } catch (e) {
      // This is non-fatal — syncToCloud already wrote the deleted status
      console.warn('[QAPD] Cloud doc removal (non-fatal):', e.message);
    }
    */

    await writeLog('deleted', oldVoucher || syncDocData, oldVoucher?.totalAmount || oldVoucher?.amount || 0)
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
        selector: { collectionName: { $in: ['parties', 'accounts', 'expenses', 'income_accounts', 'capital_accounts', 'asset_accounts', 'ledgers'] } }
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
        if (data.deleted || data.status === 'deleted' || data.isDeleted) return
        
        const accLower = (accountId || '').trim().toLowerCase()
        const unifiedSplits = resolveSplits(data, col, ledgerList)
        
        let isMatch = data.accountId === accountId || 
                      data.partyId === accountId || 
                      data.id === accountId || 
                      data.toAccountId === accountId ||
                      (data.accountName || '').trim().toLowerCase() === accLower ||
                      (data.partyName || '').trim().toLowerCase() === accLower ||
                      (data.toAccountName || '').trim().toLowerCase() === accLower;

        if (!isMatch && unifiedSplits && unifiedSplits.length > 0) {
          isMatch = unifiedSplits.some(s => s.targetId === accountId);
          if (!isMatch && ledgerList && ledgerList.length > 0) {
            const activeLedger = ledgerList.find(l => l.id === accountId);
            if (activeLedger) {
              const activeNameLower = activeLedger.name.trim().toLowerCase();
              isMatch = unifiedSplits.some(s => (s.targetName || '').trim().toLowerCase() === activeNameLower);
            }
          }
        }

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
              drName = data.toAccountName || data.drName || data.partyName || ''
              crName = data.accountName || data.crName || data.fromAccountName || ''
              if (!drName || !crName) {
                const resolved = resolveContraNames(data, ledgerList)
                drName = drName || resolved.drName
                crName = crName || resolved.crName
              }
            }
          } else if (col === 'journal_vouchers') {
            if (data.isMulti && data.rows && data.rows.length > 0) {
              const drRows = data.rows.filter(r => r.type === 'dr')
              const crRows = data.rows.filter(r => r.type === 'cr')
              if (drRows.length > 1) {
                drName = 'Multiple'
              } else if (drRows.length === 1) {
                drName = resolveLedgerName(drRows[0].id, ledgerList)
              }
              if (crRows.length > 1) {
                crName = 'Multiple'
              } else if (crRows.length === 1) {
                crName = resolveLedgerName(crRows[0].id, ledgerList)
              }
            } else {
              drName = data.drName || resolveLedgerName(data.drId, ledgerList) || ''
              crName = data.crName || resolveLedgerName(data.crId, ledgerList) || ''
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
            accountId: data.accountId || '',
            partyId: data.partyId || '',
            toAccountId: data.toAccountId || '',
            fromAccountId: data.fromAccountId || '',
            drId: data.drId || '',
            crId: data.crId || '',
            partyName: col === 'journal_vouchers' ? `${drName || '—'} / ${crName || '—'}` : (subType === 'contra' ? `${crName || '—'} → ${drName || '—'}` : (data.partyName || (data.payments?.[0]?.ledgerName) || '')),
            drName,
            crName,
            splits: resolveSplits(data, col, ledgerList),
            isMulti: data.isMulti || false,
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

/**
 * Get net balance for an account — uses getAccountLedger under the hood
 * so it always matches the detailed ledger view (like Excel cell reference).
 * @param {string} accountId
 * @param {string} accountName - used for contra Dr/Cr resolution
 * @returns {Promise<number>} net balance (positive = Dr, negative = Cr)
 */
export async function getLedgerBalance(accountId, accountName) {
  const data = await getAccountLedger(accountId)
  const txns = data.transactions || []
  let totalDr = 0
  let totalCr = 0
  const nameLower = (accountName || '').trim().toLowerCase()
  for (const t of txns) {
    const st = (t.subType || '').toLowerCase()
    if (st === 'receipt' || st === 'in') {
      totalDr += Number(t.amount || 0)
    } else if (st === 'payment' || st === 'out') {
      totalCr += Number(t.amount || 0)
    } else if (st === 'contra') {
      const isDr = (t.drName || '').trim().toLowerCase() === nameLower
      if (isDr) totalDr += Number(t.amount || 0)
      else totalCr += Number(t.amount || 0)
    }
  }
  return totalDr - totalCr
}

/**
 * Get balances for multiple accounts in one shot (batch).
 * Calls getAccountLedger individually but all reads are local RxDB (fast).
 * @param {Array} accounts - [{ id, name }]
 * @returns {Promise<Object>} map of accountId → balance
 */
export async function getLedgerBalances(accounts) {
  const results = {}
  for (const acc of accounts) {
    if (acc && acc.id) {
      results[acc.id] = await getLedgerBalance(acc.id, acc.name)
    }
  }
  return results
}

export async function listContra(params = {}) {
  const companyId = getCurrentCompanyId()
  if (!companyId) return { transactions: [], total: 0 }
  try {
    const q = query(collection(db, 'payments'), where('userId', '==', companyId), where('type', '==', 'contra'))
    const snap = await getDocs(q)
    const txns = snap.docs
      .filter(d => {
        const data = d.data();
        return !data.deleted && data.status !== 'deleted' && !data.isDeleted;
      })
      .map(d => {
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
  const name = subUser ? (subUser.name || subUser.username || 'User') : 'Admin'
  // Format: "USERNAME (QAPD)" — ACCPRO displays this in "Added/Edited By" column
  const userStr = `${name} (QAPD)`

  const vchType = voucher?.type || 'payment'
  const vchRef = voucher?.refNo || '—'
  const docName = `Voucher: ${vchType} (${vchRef})`
  
  const logData = {
    docName,
    refNo: vchRef,
    voucherDate: voucher?.date || '',
    oldValue: oldValue ? formatCurrencyForLog(oldValue) : '—',
    newValue: formatCurrencyForLog(voucher?.totalAmount || voucher?.amount || 0),
    userEmail: userStr,       // Displayed in "Added/Edited By" column
    userName: name,           // Clean name for ACCPRO parsing
    source: 'QAPD',           // Explicit marker — ACCPRO uses this to show QAPD badge
    sourceApp: 'QAPD',        // Same as source, for compatibility
    status: action.toUpperCase(), // 'CREATED', 'EDITED', 'DELETED'
    timestamp: Date.now(),
    date: new Date().toISOString().split('T')[0],
    userId: companyId         // ⬅️ CRITICAL: AccPro filters/queries logs locally by userId
  }

  // 1. Save log to local database (audit_logs collection)
  const logId = uuidv4()
  const colRef = collection(db, 'audit_logs')
  await setDoc(doc(colRef, logId), logData)

  // 2. Sync to cloud instantly — write log fields at TOP LEVEL so ACCPRO's
  //    system log page can read them directly (not nested under a 'data' field)
  try {
    const { collection: c, doc: d, setDoc: s } = await import('@firebase/firestore');
    const livePath = `companies_live/${companyId}/records`;
    const now = Date.now();
    const cloudDocRef = d(c(cloudDb, livePath), logId);
    await s(cloudDocRef, {
      ...logData,            // Fields at top level: docName, refNo, userEmail, status, etc.
      id: logId,
      collectionName: 'audit_logs',
      data: logData,         // Nested data map for ACCPRO's standard liveSync puller
      timestamp: now,
      syncTimestamp: now
    }, { merge: true });
    console.log(`[QAPD] ✅ Log synced: ${logId}`);
  } catch (e) {
    console.warn('[QAPD] Log cloud sync error:', e.message);
  }
  markSelfSynced(companyId, logId)
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
        selector: { collectionName: 'audit_logs' }
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
