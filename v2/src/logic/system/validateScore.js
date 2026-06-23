export function normalizeScoreValue(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function validateMatchScore({ teamAScore, teamBScore, allowTie = false } = {}) {
  const a = normalizeScoreValue(teamAScore);
  const b = normalizeScoreValue(teamBScore);

  if (a === null || b === null) {
    return { ok: false, message: 'กรอกคะแนนให้ครบทั้ง Team A และ Team B' };
  }

  if (a < 0 || b < 0) {
    return { ok: false, message: 'คะแนนต้องไม่ติดลบ' };
  }

  if (a > 99 || b > 99) {
    return { ok: false, message: 'คะแนนสูงผิดปกติ กรุณาตรวจอีกครั้ง' };
  }

  if (!allowTie && a === b) {
    return { ok: false, message: 'คะแนนเท่ากันไม่ได้ ต้องมีทีมชนะ' };
  }

  return { ok: true, teamAScore: a, teamBScore: b };
}
