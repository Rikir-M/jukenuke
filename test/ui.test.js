// Loads the real page in jsdom (a simulated browser) against the real
// server in fake mode, and checks the scripts and buttons work together.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const { startServer, sleep, waitFor } = require('./helpers');

describe('the page', () => {
  let s;
  let dom;
  let doc;
  let errors;
  let stateCalls;

  before(async () => {
    s = await startServer({ DEV_FAKE_SECONDS: '30' });

    errors = [];
    stateCalls = 0;

    // Only load our own files — not Google Fonts.
    class OwnFilesOnly extends ResourceLoader {
      fetch(url, options) {
        return url.startsWith(s.url) ? super.fetch(url, options) : null;
      }
    }

    const virtualConsole = new VirtualConsole();

    virtualConsole.on('jsdomError', (e) => errors.push(e.message));

    dom = await JSDOM.fromURL(s.url + '/', {
      runScripts: 'dangerously',
      resources: new OwnFilesOnly(),
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        // jsdom has no fetch of its own.
        window.fetch = (url, opts) => {
          if (String(url).includes('/api/state')) stateCalls++;
          return fetch(new URL(url, s.url).href, opts);
        };
      }
    });

    doc = dom.window.document;

    await waitFor(() => doc.getElementById('dev-badge'));
  });

  after(() => {
    dom.window.close();
    s.stop();
  });

  const reactionBtn = (emoji) =>
    [...doc.querySelectorAll('.reaction-btn')].find((b) => b.dataset.emoji === emoji);

  test('every script loads and runs without errors', () => {
    assert.deepEqual(errors, []);
  });

  test('shows the fake-mode badge', () => {
    assert.match(doc.getElementById('dev-badge').textContent, /FAKE MODE/);
  });

  test('idle: queue empty, reactions shown but dimmed', () => {
    assert.match(doc.getElementById('np-title').textContent, /QUEUE IS EMPTY/);
    assert.equal(doc.querySelectorAll('.reaction-btn').length, 5);
    assert.ok(doc.getElementById('reactions').classList.contains('idle'));
  });

  test('adding a song through the form starts it playing', async () => {
    const window = dom.window;

    doc.getElementById('song-input').value = 'ui test song';
    doc.getElementById('name-input').value = 'Tester';

    doc.getElementById('add-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );

    assert.equal(doc.getElementById('song-search').hidden, false);
    assert.equal(doc.querySelector('.wrap').inert, true);
    assert.equal(doc.getElementById('add-form').getAttribute('aria-busy'), 'true');

    await waitFor(() => /Fake: ui test song/.test(doc.getElementById('np-title').textContent), 6000);

    assert.equal(doc.getElementById('song-search').hidden, true);
    assert.equal(doc.querySelector('.wrap').inert, false);
    assert.match(doc.getElementById('np-by').textContent, /REQUESTED BY\s+Tester/);
    assert.ok(doc.getElementById('on-air').classList.contains('live'));
    assert.ok(doc.getElementById('platter-art').getAttribute('src').startsWith('data:image/svg'));
    assert.match(doc.getElementById('np-by').textContent, /\/\s*0:30/);
  });

  test('search overlay closes after server and connection errors, preserving the request', async () => {
    const window = dom.window;
    const originalFetch = window.fetch;
    try {
      for (const networkFailure of [false, true]) {
        let finish;
        window.fetch = (url, options) => String(url) === '/api/queue'
          ? new Promise((resolve, reject) => {
              finish = () => networkFailure
                ? reject(new Error('offline'))
                : resolve({ ok: false, json: async () => ({ error: 'Lookup failed' }) });
            })
          : originalFetch(url, options);
        doc.getElementById('song-input').value = 'keep this request';
        doc.getElementById('add-form').dispatchEvent(
          new window.Event('submit', { bubbles: true, cancelable: true })
        );
        assert.equal(doc.getElementById('song-search').hidden, false);
        finish();
        await waitFor(() => doc.getElementById('song-search').hidden);
        assert.equal(doc.querySelector('.wrap').inert, false);
        assert.equal(doc.getElementById('add-btn').disabled, false);
        assert.equal(doc.getElementById('song-input').value, 'keep this request');
        assert.equal(doc.getElementById('add-form').getAttribute('aria-busy'), 'false');
      }
    } finally {
      window.fetch = originalFetch;
    }
  });

  test('the elapsed time counts up', async () => {
    const read = () => doc.getElementById('elapsed').textContent;

    await waitFor(() => read() !== '--:--');

    const first = read();

    await waitFor(() => read() !== first, 3000);
  });

  test('reactions toggle and show a floating emoji', async () => {
    assert.ok(!doc.getElementById('reactions').classList.contains('idle'));

    const fire = reactionBtn('🔥');

    fire.click();

    await waitFor(() => fire.querySelector('.reaction-count').textContent === '1');

    assert.ok(fire.classList.contains('active'));
    assert.ok(doc.querySelectorAll('.reaction-float').length >= 1);

    fire.click();

    await waitFor(() => fire.querySelector('.reaction-count').textContent === '0');

    assert.ok(!fire.classList.contains('active'));
  });

  test('pause and resume', async () => {
    const btn = doc.getElementById('pause-btn');

    btn.click();
    await waitFor(() => btn.dataset.paused === 'true');
    assert.match(doc.getElementById('pause-btn-text').textContent, /Resume/);

    btn.click();
    await waitFor(() => btn.dataset.paused === 'false');
    assert.match(doc.getElementById('pause-btn-text').textContent, /Pause/);
  });

  test('a queued song shows in the setlist, and can be removed', async () => {
    const window = dom.window;

    doc.getElementById('song-input').value = 'queued song';
    doc.getElementById('add-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true })
    );

    await waitFor(() => doc.querySelectorAll('.setlist-row').length === 1, 6000);
    assert.match(doc.querySelector('.track-title').textContent, /Fake: queued song/);

    doc.querySelector('.remove-btn').click();

    await waitFor(() => doc.querySelectorAll('.setlist-row').length === 0);
    assert.match(doc.querySelector('.empty-state').textContent, /NOTHING QUEUED/);
  });

  test('polling pauses while the tab is hidden, and resumes when shown', async () => {
    const window = dom.window;
    const setHidden = (hidden) => {
      Object.defineProperty(doc, 'hidden', { configurable: true, get: () => hidden });
      doc.dispatchEvent(new window.Event('visibilitychange'));
    };

    setHidden(true);

    const before = stateCalls;

    await sleep(3200);
    assert.equal(stateCalls - before, 0, 'no polling while hidden');

    setHidden(false);

    await waitFor(() => stateCalls - before >= 1, 1000);
  });
});
