export const GAME_PREFERENCE_LABELS = Object.freeze({
  en: Object.freeze({ social: 'BEGINNER', balanced: 'MIX LEVEL', challenge: 'CHALLENGE', any: 'ANY' }),
  th: Object.freeze({ social: 'ผู้เริ่มต้น', balanced: 'คละระดับ', challenge: 'ท้าทาย', any: 'ทุกแบบ' })
});

export function gamePreferenceLabel(mode, language = 'en') {
  const locale = language === 'th' ? 'th' : 'en';
  return GAME_PREFERENCE_LABELS[locale][String(mode || '').toLowerCase()] || String(mode || '');
}

export function anyGamePreferenceLabel(language = 'en') {
  return gamePreferenceLabel('any', language);
}
