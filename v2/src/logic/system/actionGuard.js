export function createActionGuard({ onStart = () => {}, onFinish = () => {}, onError = () => {} } = {}) {
  const running = new Set();

  function isRunning(key) {
    return running.has(key);
  }

  async function run(key, action) {
    if (running.has(key)) {
      return { ok: false, skipped: true, message: 'กำลังทำงานอยู่ กรุณารอสักครู่' };
    }

    running.add(key);
    onStart(key, Array.from(running));

    try {
      const value = await action();
      return { ok: true, value };
    } catch (error) {
      const message = error?.message || 'เกิดข้อผิดพลาดในระบบ';
      onError(message, error, key);
      return { ok: false, error, message };
    } finally {
      running.delete(key);
      onFinish(key, Array.from(running));
    }
  }

  return { run, isRunning, running };
}

export function installGlobalErrorGuard(onError = () => {}) {
  window.addEventListener('error', (event) => {
    onError(event.error?.message || event.message || 'เกิดข้อผิดพลาดในหน้าเว็บ', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    onError(reason?.message || String(reason || 'เกิดข้อผิดพลาดในระบบ'), reason);
  });
}
