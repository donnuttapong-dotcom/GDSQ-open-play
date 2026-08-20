export async function normalizeEdgeFunctionError(error, fallback = 'Edge Function request failed') {
  let payload = null;
  const response = error?.context;
  try {
    const readable = typeof response?.clone === 'function' ? response.clone() : response;
    if (typeof readable?.json === 'function') payload = await readable.json();
  } catch {
    payload = null;
  }

  const message = String(payload?.error || payload?.message || error?.message || fallback).trim() || fallback;
  const normalized = new Error(message);
  normalized.code = String(payload?.code || error?.code || 'EDGE_FUNCTION_REQUEST_FAILED');
  normalized.status = Number(payload?.status || response?.status || error?.status || 0) || 0;
  return normalized;
}
