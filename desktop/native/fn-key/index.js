const path = require('path');

let fnKey;
try {
  fnKey = require('./build/Release/fn_key.node');
} catch (e) {
  console.error('Failed to load fn_key native module:', e.message);
  fnKey = null;
}

module.exports = {
  startListening: (callback) => {
    if (!fnKey) {
      console.error('fn_key native module not available');
      return { ok: false, code: 'ENOT_AVAILABLE' };
    }
    try {
      fnKey.startListening(callback);
      return { ok: true };
    } catch (e) {
      const code = e && e.code ? e.code : 'EUNKNOWN';
      console.error('Failed to start fn key listener:', e.message, '(', code, ')');
      return { ok: false, code, message: e.message };
    }
  },
  stopListening: () => {
    if (!fnKey) return;
    try {
      fnKey.stopListening();
    } catch (e) {
      console.error('Failed to stop fn key listener:', e.message);
    }
  },
  isTrusted: () => {
    if (!fnKey) return false;
    try { return fnKey.isTrusted(); } catch { return false; }
  },
  getStatus: () => {
    if (!fnKey) return { listening: false, trusted: false, available: false };
    try { return { ...fnKey.getStatus(), available: true }; }
    catch { return { listening: false, trusted: false, available: false }; }
  }
};
