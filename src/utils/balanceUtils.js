/**
 * Compute the net balance for an account from a flat list of transactions.
 * Uses ID-based matching (same approach as getAccountLedger) for accuracy.
 *
 * @param {object} account - { id, name }
 * @param {Array} allTransactions - from getDaybookAll (now includes accountId, partyId, etc.)
 * @returns {number} net balance (positive = Dr, negative = Cr)
 */
export function computeAccountBalance(account, allTransactions) {
  if (!account) return 0
  const accId = account.id
  const nameLower = (account.name || '').trim().toLowerCase()
  let balance = Number(account.openingBalance || account.balance || 0)

  // Filter transactions relevant to this account by ID first, then name
  const relevantTxns = allTransactions.filter(t => {
    if (!t) return false
    // ID-based matching (precise)
    if (accId && (
      t.accountId === accId ||
      t.partyId === accId ||
      t.toAccountId === accId ||
      t.fromAccountId === accId ||
      t.drId === accId ||
      t.crId === accId
    )) return true

    // Split-based ID matching
    if (accId && t.splits && t.splits.length > 0) {
      if (t.splits.some(s => s.targetId === accId)) return true
    }

    // Fallback: name-based matching (for legacy data without IDs)
    if (!nameLower) return false
    return (
      (t.accountName || '').trim().toLowerCase() === nameLower ||
      (t.drName || '').trim().toLowerCase() === nameLower ||
      (t.crName || '').trim().toLowerCase() === nameLower ||
      (t.partyName || '').trim().toLowerCase() === nameLower ||
      (t.drName || '').toLowerCase().split(', ').map(n => n.trim().toLowerCase()).includes(nameLower) ||
      (t.crName || '').toLowerCase().split(', ').map(n => n.trim().toLowerCase()).includes(nameLower)
    )
  })

  // Sort chronologically (oldest first) for running balance
  relevantTxns.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  for (const t of relevantTxns) {
    let isDr = false
    let isCr = false
    let amt = Number(t.amount || 0)
    const subType = (t.subType || '').toLowerCase()
    const isAccountNameMatch = (t.accountName || '').toLowerCase() === nameLower
    const isDrMatch = (t.drName || '').toLowerCase() === nameLower ||
      (t.drName || '').toLowerCase().split(', ').map(n => n.trim()).includes(nameLower)
    const isCrMatch = (t.crName || '').toLowerCase() === nameLower ||
      (t.crName || '').toLowerCase().split(', ').map(n => n.trim()).includes(nameLower)

    // Use same Dr/Cr logic as getAccountLedger / openAccountLedger
    if (t.type === 'payments') {
      if (subType === 'in' || subType === 'receipt') {
        // Receipt: cash/bank account is Dr
        // Check if this account is the cash/bank account (accountName or drName)
        if (isAccountNameMatch || (isDrMatch && !isCrMatch)) {
          isDr = true
        } else if (isCrMatch && !isDrMatch) {
          isCr = true
        } else if (isDrMatch && isCrMatch) {
          // Both match — check accountName to decide
          isDr = isAccountNameMatch
          isCr = !isAccountNameMatch
        } else {
          isDr = true // default
        }
      } else if (subType === 'out' || subType === 'payment') {
        // Payment: cash/bank account is Cr
        if (isAccountNameMatch || (isCrMatch && !isDrMatch)) {
          isCr = true
        } else if (isDrMatch && !isCrMatch) {
          isDr = true
        } else if (isDrMatch && isCrMatch) {
          isCr = isAccountNameMatch
          isDr = !isAccountNameMatch
        } else {
          isCr = true // default
        }
      } else if (subType === 'contra') {
        // Contra: check if account is the TO (drName → Dr) or FROM (crName → Cr)
        if (isDrMatch && !isCrMatch) {
          isDr = true
        } else {
          isCr = true
        }
      }
    } else if (t.type === 'journal_vouchers') {
      // For journal vouchers, match by drName/crName
      if (isDrMatch && !isCrMatch) {
        isDr = true
      } else if (isCrMatch && !isDrMatch) {
        isCr = true
      } else if (isDrMatch) {
        // Both match — default Dr
        isDr = true
      } else if (isAccountNameMatch) {
        isDr = true
      }
    } else {
      // Other types — default to Dr if account name matches
      if (isDrMatch || isAccountNameMatch) {
        isDr = true
      } else if (isCrMatch) {
        isCr = true
      }
    }

    // Handle multi-split transactions
    if (t.isMulti && t.splits && t.splits.length > 0) {
      const matchedSplit = t.splits.find(s => {
        if (accId && s.targetId === accId) return true
        return (s.targetName || '').toLowerCase() === nameLower
      })
      if (matchedSplit) {
        amt = Number(matchedSplit.amount || 0)
      }
    }

    if (isDr) balance += amt
    if (isCr) balance -= amt
  }

  return balance
}
