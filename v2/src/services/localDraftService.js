const SCORE_DRAFT_PREFIX = 'gdsq_v2_score_draft:';
const ACTION_QUEUE_KEY = 'gdsq_v2_pending_actions';

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

export function scoreDraftKey(matchId) {
  return `${SCORE_DRAFT_PREFIX}${matchId}`;
}

export function saveScoreDraft(matchId, draft) {
  if (!matchId) return null;
  const payload = {
    matchId,
    ...draft,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(scoreDraftKey(matchId), JSON.stringify(payload));
  return payload;
}

export function getScoreDraft(matchId) {
  if (!matchId) return null;
  return safeJsonParse(localStorage.getItem(scoreDraftKey(matchId)), null);
}

export function clearScoreDraft(matchId) {
  if (!matchId) return;
  localStorage.removeItem(scoreDraftKey(matchId));
}

export function listScoreDrafts() {
  const drafts = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(SCORE_DRAFT_PREFIX)) {
      drafts.push(safeJsonParse(localStorage.getItem(key), null));
    }
  }
  return drafts.filter(Boolean).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

export function enqueuePendingAction(action) {
  const queue = safeJsonParse(localStorage.getItem(ACTION_QUEUE_KEY) || '[]', []);
  const payload = {
    id: action.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    ...action,
    queuedAt: new Date().toISOString()
  };
  queue.push(payload);
  localStorage.setItem(ACTION_QUEUE_KEY, JSON.stringify(queue));
  return payload;
}

export function listPendingActions() {
  return safeJsonParse(localStorage.getItem(ACTION_QUEUE_KEY) || '[]', []);
}

export function clearPendingAction(actionId) {
  const queue = listPendingActions().filter((item) => item.id !== actionId);
  localStorage.setItem(ACTION_QUEUE_KEY, JSON.stringify(queue));
}
