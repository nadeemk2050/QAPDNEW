// QAPD Realtime Database Shim
export const getDatabase = () => ({});
export const ref = (db, path) => ({ path });
export const onValue = (ref, callback) => { callback({ exists: () => false, val: () => null }); return () => {}; };
export const get = async (ref) => ({ exists: () => false, val: () => null });
export const set = async (ref, data) => {};
export const push = (ref, data) => ({ key: null });
export const update = async (ref, data) => {};
export const remove = async (ref) => {};
export const serverTimestamp = () => Date.now();
export const query = (ref, ...constraints) => ref;
export const orderByChild = (field) => ({ type: 'orderByChild', field });
export const equalTo = (value) => ({ type: 'equalTo', value });
