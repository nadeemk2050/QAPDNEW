// QAPD Storage Shim
export const getStorage = () => ({});
export const ref = (storage, path) => ({ path });
export const uploadBytes = async (ref, file) => ({ ref, metadata: { name: file.name } });
export const getDownloadURL = async (ref) => '';
export const deleteObject = async (ref) => {};
export const listAll = async (ref) => ({ items: [], prefixes: [] });
