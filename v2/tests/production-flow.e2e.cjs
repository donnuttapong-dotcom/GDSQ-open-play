const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const baseUrl = 'https://gdsq-open-play-v2-preview.vercel.app/v2/openplay.html?mode=supabase';
const localHtml = fs.readFileSync(require.resolve('../openplay.html'), 'utf8');
const localServices = fs.readFileSync(require.resolve('../src/services/index.js'), 'utf8');
const passcode = process.env.GDSQ_TEST_PASSCODE || '';

if (!passcode) throw new Error('Set GDSQ_TEST_PASSCODE before running Production Test Mode QA.');

async function waitForIdle(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"],[data-pending="true"]'), null, { timeout: 30_000 });
  await page.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await context.newPage();
  const runtimeErrors = [];
  const networkErrors = [];
  const httpErrors = [];
  const eventName = `QA Production Readiness ${Date.now()}`;
  console.log(JSON.stringify({ phase: 'start', eventName }));

  page.on('dialog', (dialog) => dialog.accept());
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('favicon')) runtimeErrors.push(message.text());
  });
  page.on('requestfailed', (request) => networkErrors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });
  await page.route('**/v2/openplay.html?*', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: localHtml }));
  await page.route('**/v2/src/services/index.js*', (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: localServices }));

  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.click('#tabBtn-events');
    await page.fill('#newEventName', eventName);
    await page.fill('#newEventVenue', 'QA Isolated Venue');
    await page.fill('#newEventCourts', '4');
    await page.check('input[name="newEventEnvironment"][value="test"]');
    await page.fill('#newTestAdminPasscode', passcode);
    await page.click('#createEventBtn');
    await page.waitForFunction((name) => document.body.innerText.includes(name), eventName, { timeout: 30_000 });
    await waitForIdle(page);
    console.log(JSON.stringify({ phase: 'event-created' }));

    await page.click('#tabBtn-manage');
    await page.waitForSelector('[data-test-add="16"]', { timeout: 20_000 });
    await page.click('[data-test-add="16"]');
    await waitForIdle(page);
    await page.click('[data-test-add="16"]');
    await page.waitForFunction(() => Number(document.querySelector('#chipPlayers')?.textContent || 0) === 32, null, { timeout: 30_000 });
    console.log(JSON.stringify({ phase: 'players-ready', count: 32 }));

    const firstLevel = page.locator('[data-level-player]').first();
    const firstLevelPlayerId = await firstLevel.getAttribute('data-level-player');
    await firstLevel.selectOption('3');
    await waitForIdle(page);
    assert.equal(await page.locator(`[data-level-player="${firstLevelPlayerId}"]`).inputValue(), '3', 'Organizer level change must persist for a ready player');

    const manualPlayerIds = await page.locator('[data-level-player]').evaluateAll((items) => items.slice(0, 4).map((item) => item.getAttribute('data-level-player')));
    for (let index = 0; index < 4; index += 1) await page.selectOption(`#manual${index}`, manualPlayerIds[index]);
    await page.click('#manualPreviewBtn');
    await page.waitForFunction(() => document.querySelectorAll('[data-start-preview]').length === 1, null, { timeout: 30_000 });
    await page.locator('[data-cancel-preview]').first().click();
    await page.waitForFunction(() => document.querySelectorAll('[data-start-preview]').length === 0, null, { timeout: 30_000 });
    console.log(JSON.stringify({ phase: 'manual-preview-cancel-verified' }));

    await page.click('#generateAutoBtn');
    await page.waitForFunction(() => document.querySelectorAll('[data-start-preview]').length === 4, null, { timeout: 30_000 });
    const firstPreviewSelect = page.locator('[data-preview-player]').first();
    const replacementId = await firstPreviewSelect.locator('option').evaluateAll((options, current) => options.map((option) => option.value).find((value) => value && value !== current), await firstPreviewSelect.inputValue());
    assert.ok(replacementId, 'Preview must offer an eligible replacement player');
    const replacementResponsePromise = page.waitForResponse((response) => {
      if (!response.url().endsWith('/functions/v1/v2-test-admin')) return false;
      try { return JSON.parse(response.request().postData() || '{}').action === 'updateMatchPreview'; } catch { return false; }
    }, { timeout: 30_000 });
    await firstPreviewSelect.selectOption(replacementId);
    const replacementResponse = await replacementResponsePromise;
    const replacementResult = await replacementResponse.json();
    assert.equal(replacementResponse.status(), 200, `Preview replacement HTTP ${replacementResponse.status()}: ${replacementResult.error || 'unknown error'}`);
    assert.equal(replacementResult.ok, true, `Preview replacement failed: ${replacementResult.error || 'unknown error'}`);
    await waitForIdle(page);
    assert.equal(await page.locator('[data-preview-player]').first().inputValue(), replacementId, 'Preview player replacement must persist');
    const previewRosterBefore = await page.locator('[data-preview-player]').evaluateAll((items) => items.map((item) => item.value));
    const previewPlayerId = previewRosterBefore[0];
    const activeLevel = page.locator(`[data-level-player="${previewPlayerId}"]`);
    await activeLevel.selectOption('3.25');
    await waitForIdle(page);
    assert.deepEqual(await page.locator('[data-preview-player]').evaluateAll((items) => items.map((item) => item.value)), previewRosterBefore, 'Level edit must not mutate an existing Preview roster');
    console.log(JSON.stringify({ phase: 'preview-level-verified' }));

    await page.click('#startAllBtn');
    await page.waitForFunction(() => document.querySelectorAll('[data-confirm-score]').length === 4, null, { timeout: 30_000 });
    await page.click('#generateAllNextBtn');
    await page.waitForFunction(() => document.querySelectorAll('[data-cancel-next]').length === 4, null, { timeout: 30_000 });
    assert.equal(await page.locator('.queue-next').count(), 16, 'Four courts must reserve 16 unique Up Next players');
    console.log(JSON.stringify({ phase: 'up-next-created', courts: 4 }));

    const queuedCard = page.locator('.queue-next').first();
    const queuedPlayerId = await queuedCard.locator('[data-status="resting"]').getAttribute('data-player');
    await queuedCard.locator('[data-status="resting"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-cancel-next]').length === 3, null, { timeout: 30_000 });
    assert.match(await page.locator('#msg').innerText(), /UP NEXT|รอบถัดไป/, 'Cancelling a queued player must show immediate organizer feedback');
    await page.locator(`[data-player="${queuedPlayerId}"][data-status="ready"]`).click();
    await waitForIdle(page);
    await page.click('#generateAllNextBtn');
    await page.waitForFunction(() => document.querySelectorAll('[data-cancel-next]').length === 4, null, { timeout: 30_000 });
    console.log(JSON.stringify({ phase: 'queued-player-recovery-verified' }));

    for (let index = 0; index < 4; index += 1) {
      const card = page.locator('.live-match-card').first();
      await card.locator('[data-score-a]').fill('11');
      await card.locator('[data-score-b]').fill(String(7 + (index % 2)));
      await card.locator('[data-confirm-score]').click();
      await page.waitForFunction((remaining) => document.querySelectorAll('[data-confirm-score]').length === remaining, 3 - index, { timeout: 30_000 });
      await waitForIdle(page);
    }
    await page.waitForFunction(() => document.querySelectorAll('[data-start-preview]').length === 4, null, { timeout: 30_000 });
    assert.equal(await page.locator('[data-cancel-next]').count(), 0, 'Confirmed courts must promote queued matches to Preview exactly once');
    console.log(JSON.stringify({ phase: 'round-one-confirmed', matches: 4 }));

    await page.click('#startAllBtn');
    await page.waitForFunction(() => document.querySelectorAll('[data-confirm-score]').length === 4, null, { timeout: 30_000 });
    for (let index = 0; index < 4; index += 1) {
      const card = page.locator('.live-match-card').first();
      await card.locator('[data-score-a]').fill('9');
      await card.locator('[data-score-b]').fill('11');
      await card.locator('[data-confirm-score]').click();
      await page.waitForFunction((remaining) => document.querySelectorAll('[data-confirm-score]').length === remaining, 3 - index, { timeout: 30_000 });
      await waitForIdle(page);
    }
    console.log(JSON.stringify({ phase: 'round-two-confirmed', matches: 4 }));

    await page.click('#endEventBtn');
    await page.waitForSelector('#confirmEndEvent:not([disabled])', { timeout: 20_000 });
    await page.click('#confirmEndEvent');
    await page.waitForFunction(() => document.body.innerText.includes('ข้อมูลยังแยกจากระบบจริง') || document.body.innerText.includes('Test data remains isolated'), null, { timeout: 30_000 });
    console.log(JSON.stringify({ phase: 'event-ended' }));

    await page.click('#tabBtn-events');
    const card = page.locator('.card', { hasText: eventName });
    await card.locator('[data-delete-event]').click();
    await page.waitForFunction((name) => !document.body.innerText.includes(name), eventName, { timeout: 30_000 });

    assert.deepEqual(httpErrors, [], `HTTP errors: ${httpErrors.join(' | ')}`);
    assert.deepEqual(runtimeErrors, [], `Runtime errors: ${runtimeErrors.join(' | ')}`);
    assert.deepEqual(networkErrors, [], `Network errors: ${networkErrors.join(' | ')}`);
    console.log(JSON.stringify({ result: 'PASS', eventName, players: 32, courts: 4, confirmedMatches: 8, cleanedUp: true }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
