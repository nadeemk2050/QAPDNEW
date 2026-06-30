// QAPD Firestore Shim — All firebase/firestore calls go through here to local RxDB
import { v4 as uuidv4 } from 'uuid';
import { getDB } from './localDB';

export const getFirestore = () => ({});
export const initializeFirestore = (app, settings) => ({});
export const memoryLocalCache = () => ({});
export const persistentLocalCache = (settings) => ({});
export const persistentMultipleTabManager = () => ({});

export const collection = (db, path) => {
    return { path, type: 'collection' };
};

export const doc = (db, path, id) => {
    if (db && db.type === 'collection') {
        const autoId = path || id || uuidv4();
        return { path: `${db.path}/${autoId}`, type: 'doc' };
    }
    const safePath = path || uuidv4();
    return { path: id ? `${safePath}/${id}` : safePath, type: 'doc' };
};

export class Timestamp {
    constructor(seconds, nanoseconds) {
        this.seconds = seconds;
        this.nanoseconds = nanoseconds || 0;
    }
    static now() {
        return new Timestamp(Math.floor(Date.now() / 1000), 0);
    }
    toDate() {
        return new Date(this.seconds * 1000);
    }
}

export const serverTimestamp = () => {
    return { type: 'serverTimestamp' };
};

export const deleteField = () => undefined;
export const documentId = () => '__name__';

export const startAfter = (val) => ({ type: 'startAfter', val });

export const sum = (f) => ({ aggregate: 'sum', field: f });
export const count = () => ({ aggregate: 'count' });

export const getCountFromServer = async () => ({ data: () => ({ count: 0 }) });
export const getAggregateFromServer = async () => ({ data: () => ({}) });

export const query = (col, ...constraints) => {
    return { ...col, constraints };
};

export const where = (field, op, value) => ({ type: 'where', field, op, value });
export const orderBy = (field, dir = 'asc') => ({ type: 'orderBy', field, dir });
export const limit = (num) => ({ type: 'limit', num });

const matches = (id, docData, constraints) => {
    if (!constraints) return true;
    for (const c of constraints) {
        if (c.type === 'where') {
            const val = c.field === '__name__' ? id : docData[c.field];
            if (c.op === '==') { if (val !== c.value) return false; }
            else if (c.op === '>') { if (val <= c.value) return false; }
            else if (c.op === '<=') { if (val > c.value) return false; }
            else if (c.op === '<') { if (val >= c.value) return false; }
            else if (c.op === '>=') { if (val < c.value) return false; }
            else if (c.op === 'in') { if (!Array.isArray(c.value) || !c.value.includes(val)) return false; }
            else if (c.op === 'array-contains') { if (!Array.isArray(val) || !val.includes(c.value)) return false; }
        }
    }
    return true;
};

export const getDocs = async (q) => {
    const db = await getDB();
    const queryPath = q.path || q;
    if (!db.offline_records) return { docs: [], size: 0, empty: true, forEach: () => {}, map: () => [], filter: () => [], some: () => false };

    let docs = [];
    try {
        docs = await db.offline_records.find({ selector: { collectionName: queryPath } }).exec();
    } catch (e) { console.error("EXEC ERROR:", e); }

    let results = (docs || []).map(d => d.toJSON())
        .filter(d => matches(d.id, d.data, q.constraints));

    if (q.constraints) {
        const order = q.constraints.find(c => c.type === 'orderBy');
        if (order) {
            results.sort((a, b) => {
                const va = a.data[order.field];
                const vb = b.data[order.field];
                if (va < vb) return order.dir === 'asc' ? -1 : 1;
                if (va > vb) return order.dir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        const lim = q.constraints.find(c => c.type === 'limit');
        if (lim) results = results.slice(0, lim.num);
    }

    const snapshot = {
        docs: results.map(r => ({
            id: r.id,
            data: () => r.data,
            exists: () => true,
            ref: { id: r.id, path: `${queryPath}/${r.id}` },
            metadata: { fromCache: true }
        })),
        size: results.length,
        empty: results.length === 0,
        forEach(cb) { snapshot.docs.forEach(cb); },
        map(cb) { return snapshot.docs.map(cb); },
        filter(cb) { return snapshot.docs.filter(cb); },
        some(cb) { return snapshot.docs.some(cb); },
        docChanges: () => []
    };
    return snapshot;
};

export const getDoc = async (docRef) => {
    const db = await getDB();
    if (!db.offline_records || !docRef || !docRef.path) return { id: '', ref: docRef, exists: () => false, data: () => undefined };
    const parts = docRef.path.split('/');
    const id = parts[parts.length - 1];
    const colName = parts.slice(0, -1).join('/');
    try {
        const rxDoc = await db.offline_records.findOne({ selector: { id, collectionName: colName } }).exec();
        if (rxDoc) {
            const data = rxDoc.toJSON();
            return { id, ref: docRef, exists: () => true, data: () => data.data, metadata: { fromCache: true } };
        }
    } catch {}
    return { id, ref: docRef, exists: () => false, data: () => undefined };
};

function wash(data) {
    if (!data) return data;
    return JSON.parse(JSON.stringify(data, (key, value) => {
        if (value && typeof value === 'object' && (value.constructor?.name === 'Timestamp' || typeof value.toDate === 'function')) {
            const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value.seconds * 1000);
            return { seconds: Math.floor(date.getTime() / 1000), nanoseconds: 0 };
        }
        if (value && value.type === 'serverTimestamp') return Date.now();
        return value;
    }));
}

export const addDoc = async (colRef, data) => {
    const db = await getDB();
    const newId = uuidv4();
    const cleanData = wash(data);
    await db.offline_records.insert({
        id: newId,
        collectionName: colRef.path,
        data: cleanData,
        timestamp: Date.now()
    });
    try { if (window.__qapdNotifyDataChange) window.__qapdNotifyDataChange({ id: newId, collectionName: colRef.path, operation: 'INSERT' }); } catch(e) {}
    return { id: newId, path: `${colRef.path}/${newId}` };
};

export const setDoc = async (docRef, data, options = { merge: false }) => {
    const db = await getDB();
    if (!docRef || !docRef.path) return;
    const parts = docRef.path.split('/');
    const colName = parts.slice(0, -1).join('/');
    const id = parts[parts.length - 1];
    if (!db.offline_records) return;
    const cleanData = wash(data);

    const isConflictError = (e) =>
        e?.rxdb === true || e?.code === 'CONFLICT' || (e?.message && e.message.includes('CONFLICT'));

    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const exist = await db.offline_records.findOne({ selector: { id, collectionName: colName } }).exec();
            if (exist) {
                if (options.merge) {
                    const existingData = JSON.parse(JSON.stringify(exist.toJSON().data || {}));
                    await exist.patch({ data: { ...existingData, ...cleanData }, timestamp: Date.now() });
                } else {
                    await exist.patch({ data: cleanData, timestamp: Date.now() });
                }
            } else {
                await db.offline_records.insert({ id, collectionName: colName, data: cleanData, timestamp: Date.now() });
            }
            try { if (window.__qapdNotifyDataChange) window.__qapdNotifyDataChange({ id, collectionName: colName, operation: exist ? 'UPDATE' : 'INSERT' }); } catch(e) {}
            return;
        } catch (e) {
            if (isConflictError(e) && attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, 30 * (attempt + 1)));
                continue;
            }
            throw e;
        }
    }
};

export const updateDoc = async (docRef, data) => {
    return setDoc(docRef, data, { merge: true });
};

export const deleteDoc = async (docRef) => {
    const db = await getDB();
    if (!docRef || !docRef.path) return;
    const parts = docRef.path.split('/');
    const colName = parts.slice(0, -1).join('/');
    const id = parts[parts.length - 1];
    try {
        const exist = await db.offline_records.findOne({ selector: { id, collectionName: colName } }).exec();
        if (exist) await exist.remove();
        try { if (window.__qapdNotifyDataChange) window.__qapdNotifyDataChange({ id, collectionName: colName, operation: 'DELETE' }); } catch(e) {}
    } catch {}
};

export const onSnapshot = (q, callback) => {
    const queryPath = q.path || q;
    let subscription = null;
    let isUnsubscribed = false;

    getDB().then(db => {
        if (isUnsubscribed || !db.offline_records) return;
        const rxQuery = db.offline_records.find({ selector: { collectionName: queryPath } });
        subscription = rxQuery.$.subscribe(rxDocs => {
            const rxArr = rxDocs || [];
            const mapped = rxArr.map(d => d.toJSON()).filter(d => matches(d.id, d.data, q.constraints));
            const snap = {
                docs: mapped.map(r => ({
                    id: r.id,
                    data: () => r.data,
                    exists: () => true,
                    ref: { id: r.id, path: `${queryPath}/${r.id}` },
                    metadata: { fromCache: true }
                })),
                size: mapped.length,
                empty: mapped.length === 0,
                forEach(cb) { snap.docs.forEach(cb); },
                map(cb) { return snap.docs.map(cb); },
                docChanges: () => mapped.map(r => ({ type: 'added', doc: { id: r.id, data: () => r.data, exists: () => true } }))
            };
            callback(snap);
        });
    });

    return () => {
        isUnsubscribed = true;
        if (subscription) subscription.unsubscribe();
    };
};

export const writeBatch = () => {
    const ops = [];
    return {
        set: (ref, data, opts) => ops.push(() => setDoc(ref, data, opts)),
        update: (ref, data) => ops.push(() => updateDoc(ref, data)),
        delete: (ref) => ops.push(() => deleteDoc(ref)),
        commit: async () => { for (const op of ops) await op(); }
    };
};

export const runTransaction = async (db, callback) => {
    const transaction = {
        get: async (ref) => await getDoc(ref),
        set: async (ref, data, opts) => await setDoc(ref, data, opts),
        update: async (ref, data) => await updateDoc(ref, data),
        delete: async (ref) => await deleteDoc(ref)
    };
    try { return await callback(transaction); }
    catch (e) { throw e; }
};
