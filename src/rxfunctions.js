// QAPD Cloud Functions Shim
export const getFunctions = () => ({});
export const httpsCallable = (functions, name) => async (data) => {
    console.warn(`[QAPD] Cloud function "${name}" called — no-op stub`);
    return { data: null };
};
export const connectFunctionsEmulator = () => {};
