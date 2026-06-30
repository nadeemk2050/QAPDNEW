// QAPD Local Database — RxDB with Dexie storage
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBMigrationPlugin } from 'rxdb/plugins/migration-schema';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';

addRxPlugin(RxDBMigrationPlugin);
addRxPlugin(RxDBUpdatePlugin);

let masterDbPromise = null;
let companyDbPromise = null;
let currentCompanyId = (() => {
    const val = localStorage.getItem('activeCompanyId');
    if (val === 'null' || val === 'undefined') {
        localStorage.removeItem('activeCompanyId');
        return null;
    }
    return val || null;
})();

export const setCurrentCompanyId = (id) => {
    currentCompanyId = id;
    if (id) localStorage.setItem('activeCompanyId', id);
    else localStorage.removeItem('activeCompanyId');
    companyDbPromise = null; // Force re-create on next getDB
};

export const getCurrentCompanyId = () => currentCompanyId;

const genericSchema = {
    version: 4,
    primaryKey: 'id',
    type: 'object',
    properties: {
        id: { type: 'string', maxLength: 100 },
        data: { type: 'object' },
        collectionName: { type: 'string', maxLength: 50 },
        timestamp: { type: 'number' },
        lastSync: { type: 'number' }
    },
    required: ['id', 'collectionName'],
    indexes: ['collectionName', 'lastSync']
};

const migrationStrategies = {
    1: (oldDoc) => { if (!oldDoc.collectionName) oldDoc.collectionName = 'unknown'; return oldDoc; },
    2: (oldDoc) => { oldDoc.lastSync = oldDoc.lastSync || 0; return oldDoc; },
    3: (oldDoc) => oldDoc,
    4: (oldDoc) => oldDoc
};

const _masterDBCollections = {
    offline_records: { schema: genericSchema, migrationStrategies },
    company_registry: {
        schema: {
            version: 2,
            primaryKey: 'id',
            type: 'object',
            properties: {
                id: { type: 'string', maxLength: 100 },
                name: { type: 'string' },
                createdAt: { type: 'number' },
                createdBy: { type: 'string' },
                creationDevice: { type: 'string' },
                settings: { type: 'object' },
                history: { type: 'array' }
            },
            required: ['id', 'name']
        },
        migrationStrategies: {
            1: (doc) => { doc.history = doc.history || []; return doc; },
            2: (doc) => doc
        }
    },
    device_name: {
        schema: {
            version: 0,
            primaryKey: 'hostname',
            type: 'object',
            properties: {
                hostname: { type: 'string', maxLength: 100 },
                customName: { type: 'string' }
            },
            required: ['hostname']
        }
    }
};

const _companyDBCollections = {
    offline_records: { schema: genericSchema, migrationStrategies }
};

async function openDBWithRepair(dbName, factory, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await factory();
        } catch (err) {
            if (i === maxRetries - 1) throw err;
            console.warn(`DB open failed (attempt ${i+1}), retrying...`, err.message);
            await new Promise(r => setTimeout(r, 500));
            // Try deleting and recreating
            try {
                const { removeRxDatabase } = await import('rxdb');
                await removeRxDatabase(dbName, getRxStorageDexie());
            } catch {}
        }
    }
    throw new Error(`Failed to open database ${dbName}`);
}

export const getMasterDB = async () => {
    if (!masterDbPromise) {
        masterDbPromise = openDBWithRepair('nadtally_master_db', async () => {
            const db = await createRxDatabase({
                name: 'nadtally_master_db',
                storage: getRxStorageDexie(),
                multiInstance: true,
                ignoreDuplicate: true
            });
            await db.addCollections(_masterDBCollections);
            return db;
        });
    }
    return masterDbPromise;
};

export const getDB = async () => {
    if (!currentCompanyId) {
        return getMasterDB();
    }
    if (!companyDbPromise) {
        const dbName = `nadtally_company_${currentCompanyId}`;
        companyDbPromise = openDBWithRepair(dbName, async () => {
            const db = await createRxDatabase({
                name: dbName,
                storage: getRxStorageDexie(),
                multiInstance: true,
                ignoreDuplicate: true
            });
            await db.addCollections(_companyDBCollections);
            return db;
        });
        companyDbPromise.catch(() => { companyDbPromise = null; });
    }
    return companyDbPromise;
};

export const closeDB = async () => {
    if (companyDbPromise) {
        const db = await companyDbPromise;
        if (db && !db.destroyed) await db.destroy();
        companyDbPromise = null;
    }
    if (masterDbPromise) {
        const db = await masterDbPromise;
        if (db && !db.destroyed) await db.destroy();
        masterDbPromise = null;
    }
};

export const loadCompanyDataFromSnapshot = (collectionName, documents) => {
    // Handles data from onSnapshot or getDocs
    return documents.map(d => ({ id: d.id, ...d.data() }));
};
