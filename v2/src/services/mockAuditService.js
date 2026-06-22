const AUDIT_KEY = 'gdsq_v2_audit_log';

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

export async function writeAuditLog(action, metadata = {}) {
  const list = safeJsonParse(localStorage.getItem(AUDIT_KEY) || '[]', []);
  const entry = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    action,
    metadata,
    createdAt: new Date().toISOString()
  };
  list.unshift(entry);
  localStorage.setItem(AUDIT_KEY, JSON.stringify(list.slice(0, 100)));
  await delay(40);
  return entry;
}

export async function getAuditLogs() {
  await delay(60);
  return safeJsonParse(localStorage.getItem(AUDIT_KEY) || '[]', []);
}

export function clearAuditLogs() {
  localStorage.removeItem(AUDIT_KEY);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
