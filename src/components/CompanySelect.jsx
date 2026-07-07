import React, { useState, useEffect } from 'react';
import { Building2, DownloadCloud, HardDrive, RefreshCw, Loader2, Search, AlertCircle, LogOut, Trash2 } from 'lucide-react';
import { getMasterDB, setCurrentCompanyId, getDB, deleteLocalCompany } from '../localDB';
import { auth, cloudDb } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, getDocs, onSnapshot } from '@firebase/firestore';
import { db } from '../firebase';

export default function CompanySelect({ user, onSelectCompany, onLogout }) {
  const [localCompanies, setLocalCompanies] = useState([]);
  const [cloudCompanies, setCloudCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('local'); // local | cloud
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadLocalCompanies();
    subscribeCloudRegistry();
  }, []);

  const loadLocalCompanies = async () => {
    try {
      const masterDB = await getMasterDB();
      const allDocs = await masterDB.company_registry.find().exec();
      // Filter by current user — each user sees only their own downloaded companies
      const uid = user?.uid;
      const filtered = allDocs
        .map(d => d.toJSON())
        .filter(c => c.createdBy === uid);
      setLocalCompanies(filtered);
    } catch (e) {
      console.warn('[QAPD] Failed to load local companies:', e);
    } finally {
      setLoading(false);
    }
  };

  // Live subscription to the cloud registry — filtered by current user's email
  const subscribeCloudRegistry = () => {
    try {
      const registryRef = collection(cloudDb, 'nadtally_live_registry');
      // Filter by ownerEmail so each user sees only their own companies
      const filteredQ = query(registryRef, where('ownerEmail', '==', user?.email || ''));
      const unsub = onSnapshot(filteredQ, (snapshot) => {
        const companies = snapshot.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || `Company (${d.id.slice(0, 8)}...)`,
            stats: data.stats || {},
            isLive: data.isLive,
            lastUpdated: data.lastUpdated,
            ...data
          };
        });
        setCloudCompanies(companies);
      }, (err) => {
        console.warn('[QAPD] Registry onSnapshot error:', err.message);
        // Fallback: try fetching without filter
        getDocs(registryRef).then(snap => {
          const byEmail = snap.docs.filter(d => d.data().ownerEmail === user?.email);
          setCloudCompanies(byEmail.map(d => ({ id: d.id, ...d.data() })));
        }).catch(() => {});
      });
      return unsub;
    } catch (e) {
      console.warn('[QAPD] Failed to subscribe to registry:', e.message);
    }
  };

  const scanCloudCompanies = async () => {
    try {
      const registryRef = collection(cloudDb, 'nadtally_live_registry');
      const allSnap = await getDocs(registryRef);
      const companies = allSnap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || `Company (${d.id.slice(0, 8)}...)`,
          stats: data.stats || {},
          ...data
        };
      });
      setCloudCompanies(companies);
      console.log(`[QAPD] Registry scan: ${companies.length} companies`);
    } catch (e) {
      console.error('[QAPD] Registry scan error:', e);
      setError('Cloud scan error: ' + e.message);
    }
  };

  const handleSelectLocal = async (company) => {
    setCurrentCompanyId(company.id);
    onSelectCompany(company);
  };

  const handleDeleteClick = async (company) => {
    const pwd = prompt(`Enter password to delete local offline data for "${company.name}":`);
    if (pwd === null) return;
    if (pwd !== 'abcd') {
      alert('Incorrect password!');
      return;
    }
    if (confirm(`Are you sure you want to permanently delete all local offline data for "${company.name}"? This action cannot be undone.`)) {
      setSyncing(true);
      try {
        await deleteLocalCompany(company.id);
        await loadLocalCompanies();
      } catch (err) {
        console.error('Failed to delete company data:', err);
        alert('Failed to delete company data: ' + err.message);
      } finally {
        setSyncing(false);
      }
    }
  };

  const handleDownloadFromCloud = async (company) => {
    setSyncing(true);
    try {
      // Register in local registry
      const masterDB = await getMasterDB();
      const existing = await masterDB.company_registry.findOne({ selector: { id: company.id } }).exec();
      if (!existing) {
        await masterDB.company_registry.insert({
          id: company.id,
          name: company.name || company.companyName || 'Company',
          createdAt: Date.now(),
          createdBy: user?.uid || '',
          creationDevice: navigator.userAgent || '',
          settings: {},
          history: [{ action: 'downloaded_from_cloud', timestamp: Date.now() }]
        });
      }
      setCurrentCompanyId(company.id);

      // Download ALL data from companies_live/{companyId}/records
      // This is where ACCPRO stores all synced data as flat records with collectionName field
      const companyDB = await getDB();
      const { collection, query, getDocs } = await import('@firebase/firestore');
      const livePath = `companies_live/${company.id}/records`;

      try {
        const recordsRef = collection(cloudDb, livePath);
        const allSnap = await getDocs(recordsRef);
        console.log(`[QAPD] Downloading ${allSnap.size} total records from ${livePath}`);

        let written = 0;
        for (const docSnap of allSnap.docs) {
          try {
            const data = docSnap.data();
            const colName = data.collectionName || 'unknown';
            const docId = data.id || docSnap.id;
            let docData = data.data;
            if (!docData || Object.keys(docData).length === 0) {
              const { id: dummyId, collectionName: dummyCol, timestamp: dummyTs, lastSync: dummyLs, syncTimestamp: dummySts, ...business } = data;
              docData = business;
            }

            await companyDB.offline_records.upsert({
              id: docId,
              collectionName: colName,
              data: docData,
              timestamp: data.timestamp || Date.now(),
              lastSync: data.syncTimestamp || Date.now()
            });
            written++;
          } catch (e) {
            console.warn('[QAPD] Failed to write record:', e.message);
          }
        }
        console.log(`[QAPD] Successfully wrote ${written} records locally`);
      } catch (e) {
        console.warn(`[QAPD] Failed to download from ${livePath}:`, e.message);
      }

      onSelectCompany(company);
    } catch (e) {
      console.error('[QAPD] Download failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); } catch {}
    onLogout();
  };

  const filterList = (list) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c => (c.name || c.companyName || '').toLowerCase().includes(q));
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-indigo-950 via-indigo-900 to-slate-900 flex items-start justify-center p-4 pt-12"
      style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Select Company</h1>
            <p className="text-indigo-300 text-xs mt-0.5">Choose a company to work with</p>
          </div>
          <button onClick={handleLogout} className="p-2 rounded-xl bg-white/10 text-indigo-300 hover:bg-white/20 transition-colors" title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
          <input
            type="text"
            placeholder="Search companies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder-indigo-300/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSelectedTab('local')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              selectedTab === 'local' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/10 text-indigo-300 hover:bg-white/20'
            }`}
          >
            <HardDrive size={14} /> Local ({localCompanies.length})
          </button>
          <button
            onClick={() => setSelectedTab('cloud')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              selectedTab === 'cloud' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white/10 text-indigo-300 hover:bg-white/20'
            }`}
          >
            <DownloadCloud size={14} /> Cloud ({cloudCompanies.length})
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center py-12 text-indigo-300">
            <Loader2 size={24} className="animate-spin mb-2" />
            <p className="text-xs">Loading companies...</p>
          </div>
        )}

        {/* Syncing */}
        {syncing && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-indigo-900 rounded-2xl p-6 text-center border border-white/10">
              <Loader2 size={32} className="animate-spin text-indigo-400 mx-auto mb-3" />
              <p className="text-white text-sm font-bold">Downloading company data...</p>
              <p className="text-indigo-300 text-xs mt-1">This may take a moment</p>
            </div>
          </div>
        )}

        {/* Company List */}
        {!loading && (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {selectedTab === 'local' && filterList(localCompanies).length === 0 && (
              <div className="text-center py-12 text-indigo-400/50">
                <Building2 size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No local companies</p>
                <p className="text-xs mt-1">Download from cloud or create a new one</p>
              </div>
            )}

            {selectedTab === 'cloud' && filterList(cloudCompanies).length === 0 && (
              <div className="text-center py-12 text-indigo-400/50">
                <DownloadCloud size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No cloud companies found</p>
                <p className="text-xs mt-1">Companies will appear here from ACCPRO</p>
              </div>
            )}

            {/* Local companies */}
            {selectedTab === 'local' && filterList(localCompanies).map(company => (
              <div
                key={company.id}
                onClick={() => handleSelectLocal(company)}
                className="w-full text-left p-3.5 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 hover:border-indigo-500/50 transition-all group flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{company.name}</p>
                    <p className="text-indigo-300 text-[10px]">Local — Tap to open</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(company);
                    }}
                    className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all z-10"
                    title="Delete local data"
                  >
                    <Trash2 size={16} />
                  </button>
                  <HardDrive size={16} className="text-indigo-400/30 group-hover:text-indigo-400 transition-colors" />
                </div>
              </div>
            ))}

            {/* Cloud companies */}
            {selectedTab === 'cloud' && filterList(cloudCompanies).map(company => {
              const isLocal = localCompanies.some(l => l.id === company.id);
              const stats = company.stats || {};
              return (
                <button
                  key={company.id}
                  onClick={() => handleDownloadFromCloud(company)}
                  disabled={syncing}
                  className="w-full text-left p-3.5 rounded-xl bg-white/10 border border-white/10 hover:bg-white/15 hover:border-emerald-500/50 transition-all group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                      <DownloadCloud size={18} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{company.name || company.companyName || `Company (${company.id.slice(0, 8)}...)`}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">{stats.ledgers || 0} LGR</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">{stats.vouchers || 0} VCH</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">{stats.logs || 0} LOG</span>
                        <span className="text-[9px] text-emerald-400/70 font-medium">{isLocal ? '✓ Downloaded' : 'Available in Cloud'}</span>
                      </div>
                    </div>
                    {!isLocal && <DownloadCloud size={16} className="text-emerald-400/30 group-hover:text-emerald-400 transition-colors shrink-0" />}
                    {isLocal && <HardDrive size={16} className="text-indigo-400/50 shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
