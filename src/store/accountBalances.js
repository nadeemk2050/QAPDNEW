/**
 * Global Account Balance Store
 * 
 * Like an Excel named range — any component can import this and
 * read the latest balance for any account by ID or name.
 * 
 * Reads directly from getAccountLedger() — the SAME source as the
 * detailed ledger view. No DaybookLive recomputation, no name-based
 * matching. Just the raw ledger balance from local RxDB.
 * 
 * Usage:
 *   import { getBalance, getBalanceByName, refreshAllBalances } from '../store/accountBalances'
 *   const bal = getBalance('accountId123')          // → 18497.90
 *   const bal2 = getBalanceByName('RIZWAN CONTRA')  // → 18497.90
 *   await refreshAllBalances()                      // fetch all from ledger
 */

import { getAccountLedger, listAccounts } from '../api'

// ─── In-memory cache ─────────────────────────────────────────────────────────
const balanceCache = new Map()      // accountId → balance
const nameToIdMap = new Map()       // accountName (lower) → accountId

// ─── Events — notify components when balances update ─────────────────────────
const listeners = new Set()

function notifyListeners() {
  listeners.forEach(fn => {
    try { fn({ balances: balanceCache }) } catch (e) {}
  })
}

export function onBalancesChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ─── Balance from ledger — EXACT same logic as openAccountLedger ─────────────

function ledgerNetBalance(txns, accountName) {
  let totalDr = 0
  let totalCr = 0
  const nameLower = (accountName || '').trim().toLowerCase()
  for (const t of txns) {
    const st = (t.subType || '').toLowerCase()
    const amt = Number(t.amount || 0)
    if (st === 'receipt' || st === 'in') {
      totalDr += amt
    } else if (st === 'payment' || st === 'out') {
      totalCr += amt
    } else if (st === 'contra') {
      const isDr = (t.drName || '').trim().toLowerCase() === nameLower
      if (isDr) totalDr += amt
      else totalCr += amt
    }
  }
  return totalDr - totalCr
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Get cached balance for an account by ID (null if not loaded). */
export function getBalance(accountId) {
  return balanceCache.get(accountId) ?? null
}

/** Get cached balance for an account by name (null if not loaded). */
export function getBalanceByName(accountName) {
  const id = nameToIdMap.get((accountName || '').trim().toLowerCase())
  if (!id) return null
  return balanceCache.get(id) ?? null
}

/** Get full balance map { accountId → balance }. */
export function getAllBalances() {
  return Object.fromEntries(balanceCache)
}

/**
 * Refresh ALL account balances — calls getAccountLedger() per account.
 * This is the SAME function the detailed ledger view uses, so the
 * balance will ALWAYS match what you see when clicking an account.
 */
export async function refreshAllBalances() {
  const accData = await listAccounts()
  const accounts = accData.accounts || []

  // Build name→id map
  for (const acc of accounts) {
    if (acc.name) nameToIdMap.set(acc.name.trim().toLowerCase(), acc.id)
  }

  // Fetch each account's ledger from local RxDB and compute net
  const results = {}
  for (const acc of accounts) {
    if (!acc.id) continue
    try {
      const ledgerData = await getAccountLedger(acc.id)
      const txns = ledgerData.transactions || []
      const net = ledgerNetBalance(txns, acc.name)
      balanceCache.set(acc.id, net)
      results[acc.id] = net
    } catch (e) {
      console.warn(`[BalanceStore] Ledger fetch failed for ${acc.name}:`, e)
      const fallback = Number(acc.openingBalance || acc.balance || 0)
      balanceCache.set(acc.id, fallback)
      results[acc.id] = fallback
    }
  }

  // Cache enriched accounts
  try {
    localStorage.setItem('quickaccpro_cached_accounts',
      JSON.stringify(accounts.map(a => ({ ...a, balance: results[a.id] ?? 0 }))))
  } catch {}

  notifyListeners()
  return results
}

/**
 * Refresh a single account's balance.
 */
export async function refreshBalance(accountId, accountName) {
  try {
    const ledgerData = await getAccountLedger(accountId)
    const net = ledgerNetBalance(ledgerData.transactions || [], accountName)
    balanceCache.set(accountId, net)
    if (accountName) nameToIdMap.set(accountName.trim().toLowerCase(), accountId)
    notifyListeners()
    return net
  } catch (e) {
    console.warn(`[BalanceStore] Failed for ${accountName}:`, e)
    return null
  }
}
