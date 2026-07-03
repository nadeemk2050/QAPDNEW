/**
 * QAPD Cloud Sync — follows the app's existing pattern:
 *   1. Download cloud data → local RxDB (done on login in CompanySelect)
 *   2. All CRUD works on local RxDB first
 *   3. Local syncs to cloud via syncToCloud()
 *   4. Other devices' changes need to come cloud → local
 *
 * This module handles step 4: pulling EXTERNAL changes from cloud into local RxDB.
 * Uses onSnapshot (no Firestore index needed).
 * Includes a self-write guard to prevent feedback loop with QAPD's own syncToCloud().
 */

import { collection, query, onSnapshot } from '@firebase/firestore';
import { cloudDb } from './firebase';
import { getDB } from './localDB';

let unsubscribe = null;
let currentCompanyId = null;
let debounceTimer = null;

// ─── Self-write guard ─────────────────────────────────────────────────
// Tracks doc IDs that QAPD itself just synced to cloud via syncToCloud().
// The listener skips these to avoid feedback loop.
const selfSyncedDocs = new Set();
const SELF_SYNC_TTL = 5000; // 5s TTL — enough for the snapshot to arrive

/**
 * Called by api.js's syncToCloud() after a successful cloud write.
 * Marks the doc as self-synced so the onSnapshot listener ignores it.
 */
export function markSelfSynced(companyId, docId) {
  const key = `${companyId}:${docId}`;
  selfSyncedDocs.add(key);
  setTimeout(() => selfSyncedDocs.delete(key), SELF_SYNC_TTL);
}

function isSelfSynced(companyId, docId) {
  return selfSyncedDocs.has(`${companyId}:${docId}`);
}

// ─── Local DB sync helpers ────────────────────────────────────────────

async function upsertLocalRecord(companyDB, docId, colName, docData, syncTs, timestamp) {
  await companyDB.offline_records.upsert({
    id: docId,
    collectionName: colName,
    data: docData,
    timestamp: timestamp || Date.now(),
    lastSync: syncTs
  });
}

async function removeLocalRecord(companyDB, docId, colName) {
  const existing = await companyDB.offline_records.findOne({
    selector: { id: docId, collectionName: colName }
  }).exec();
  if (existing) {
    await existing.remove();
  }
}

// ─── UI Notification ──────────────────────────────────────────────────

function triggerRefresh() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Clear cached data so next component read is fresh
    try { localStorage.removeItem('quickaccpro_cached_transactions'); } catch {}
    try { localStorage.removeItem('quickaccpro_cached_accounts'); } catch {}
    try { localStorage.removeItem('quickaccpro_cached_ledgers'); } catch {}

    // Notify DaybookLive and other components to re-read from local RxDB
    window.dispatchEvent(new CustomEvent('qapd-cloud-sync-flush', {
      detail: { timestamp: Date.now() }
    }));
  }, 300);
}

// ─── Main listener ────────────────────────────────────────────────────

export async function startCloudSync(companyId) {
  stopCloudSync();

  if (!companyId || !cloudDb) {
    console.warn('[CloudSync] No companyId or cloudDb');
    return;
  }

  currentCompanyId = companyId;
  const livePath = `companies_live/${companyId}/records`;

  console.log(`[CloudSync] Listening on ${livePath}`);

  try {
    const recordsRef = collection(cloudDb, livePath);
    const recordsQuery = query(recordsRef);
    let processing = false;

    unsubscribe = onSnapshot(recordsQuery, async (snapshot) => {
      if (processing) return;
      processing = true;

      const changes = snapshot.docChanges();
      let hasExternalChange = false;

      for (const change of changes) {
        const docSnap = change.doc;
        const data = docSnap.data();
        const docId = data.id || docSnap.id;
        const colName = data.collectionName || 'unknown';
        const operation = change.type;

        // Handle TWO data formats:
        // 1) data.data exists → fields nested under 'data' (vouchers, accounts, QAPD-style)
        // 2) data.data missing → fields at top level (audit logs from ACCPRO)
        let docData = data.data;
        if (!docData || Object.keys(docData).length === 0) {
          // Strip metadata fields, keep business fields
          const { id, collectionName, timestamp, lastSync, syncTimestamp, ...business } = data;
          docData = business;
        }

        // ⬅️ Skip changes that QAPD itself initiated via syncToCloud()
        if (isSelfSynced(companyId, docId)) {
          continue;
        }

        hasExternalChange = true;

        try {
          const companyDB = await getDB();
          if (!companyDB || !companyDB.offline_records) continue;

          if (operation === 'removed') {
            await removeLocalRecord(companyDB, docId, colName);
            console.log(`[CloudSync] Removed locally: ${colName}/${docId}`);
          } else {
            // added or modified — upsert into local RxDB (same pattern as login download)
            const syncTs = data.syncTimestamp || data.timestamp || Date.now();
            await upsertLocalRecord(companyDB, docId, colName, docData, syncTs, data.timestamp);
            console.log(`[CloudSync] Synced to local: ${colName}/${docId} (${operation})`);
          }
        } catch (err) {
          console.warn(`[CloudSync] Error processing ${docId}:`, err.message);
        }
      }

      if (hasExternalChange) {
        triggerRefresh();
      }

      processing = false;
    }, (error) => {
      console.error('[CloudSync] Listener error:', error.message);
      processing = false;
    });

    console.log(`[CloudSync] ✅ Active`);
  } catch (err) {
    console.error('[CloudSync] Failed to start:', err.message);
  }
}

export function stopCloudSync() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    console.log(`[CloudSync] Stopped listener for ${currentCompanyId || 'unknown'}`);
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  currentCompanyId = null;
}

/**
 * Check if the sync listener is active.
 */
export function isCloudSyncActive() {
  return unsubscribe !== null;
}
