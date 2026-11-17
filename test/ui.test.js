// Loads the real page in jsdom (a simulated browser) against the real
// server in fake mode, and checks the scripts and buttons work together.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM, ResourceLoader, VirtualConsole } = require("jsdom");
const { startServer, sleep, waitFor } = require("./helpers");

describe("the page", () => {
  let s;
  let dom;
  let doc;
  let errors;
  let stateCalls;

  before(async () => {
    s = await startServer({ DEV_FAKE_SECONDS: "30" });

    errors = [];
    stateCalls = 0;

    // Only load our own files — not Google Fonts.
    class OwnFilesOnly extends ResourceLoader {
      fetch(url, options) {
        return url.startsWith(s.url) ? super.fetch(url, options) : null;
      }
    }

    const virtualConsole = new VirtualConsole();

    virtualConsole.on("jsdomError", (e) => errors.push(e.message));

    dom = await JSDOM.fromURL(s.url + "/", {
      runScripts: "dangerously",
      resources: new OwnFilesOnly(),
      pretendToBeVisual: true,
      virtualConsole,
      beforeParse(window) {
        // jsdom has no fetch of its own.
        window.fetch = (url, opts) => {
          if (String(url).includes("/api/state")) stateCalls++;
          return fetch(new URL(url, s.url).href, opts);
        };
      },
    });

    doc = dom.window.document;

    await waitFor(() => doc.getElementById("dev-badge"));
  });

  after(async () => {
    dom.window.stopPolling();
    await dom.window.refresh();
    dom.window.close();
    s.stop();
  });

  const reactionBtn = (emoji) =>
    [...doc.querySelectorAll(".reaction-btn")].find(
      (b) => b.dataset.emoji === emoji,
    );

  test("every script loads and runs without errors", () => {
    assert.deepEqual(errors, []);
  });

  test("shows the fake-mode badge", () => {
    assert.match(doc.getElementById("dev-badge").textContent, /FAKE MODE/);
  });

  test("late reaction responses cannot overwrite the next track", async () => {
    const window = dom.window;
    window.stopPolling();
    await window.refresh();
    const originalFetch = window.fetch;
    const buttons = [...doc.querySelectorAll(".reaction-btn")];
    const emoji = buttons[0].dataset.emoji;
    const counts = Object.fromEntries(
      buttons.map((button) => [button.dataset.emoji, 0]),
    );
    let release;
    window.fetch = (url, options) =>
      String(url) === "/api/react"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : originalFetch(url, options);
    try {
      window.renderReactions({ id: 501, reactions: counts, myReactions: [] });
      buttons[0].click();
      window.renderReactions({ id: 502, reactions: counts, myReactions: [] });
      release({
        ok: true,
        status: 200,
        json: async () => ({
          reactions: { ...counts, [emoji]: 1 },
          myReactions: [emoji],
        }),
      });
      await sleep(30);
      assert.equal(
        buttons[0].querySelector(".reaction-count").textContent,
        "0",
      );
      assert.equal(buttons[0].classList.contains("active"), false);
    } finally {
      window.fetch = originalFetch;
      await window.refresh();
      window.startPolling();
    }
  });

  test("save warning is visible during persistence failure and clears on recovery", async () => {
    const window = dom.window;
    window.stopPolling();
    await window.refresh();
    const originalFetch = window.fetch;
    const state = await s.get("/api/state");
    try {
      window.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ...state, persistenceError: true }),
      });
      await window.refresh();
      assert.equal(doc.getElementById("storage-status").hidden, false);
      assert.equal(doc.getElementById("connection-status").hidden, true);
      window.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ...state, persistenceError: false }),
      });
      await window.refresh();
      assert.equal(doc.getElementById("storage-status").hidden, true);
    } finally {
      window.fetch = originalFetch;
      await window.refresh();
      window.startPolling();
    }
  });

  test("record and clock wait for audio and stop while buffering", async () => {
    const window = dom.window;
    window.stopPolling();
    await window.refresh();
    const data = {
      paused: false,
      queue: [],
      current: {
        id: 99,
        title: "Slow track",
        addedBy: "Tester",
        thumbnail: null,
        timePos: null,
        duration: null,
        playbackStatus: "loading",
        loadingSeconds: 16,
      },
    };
    try {
      window.renderNowPlaying(data);
      assert.equal(
        doc.getElementById("np-eyebrow").textContent,
        "LOADING AUDIO",
      );
      assert.equal(doc.getElementById("on-air-text").textContent, "LOADING");
      assert.equal(
        doc.getElementById("platter").classList.contains("spinning"),
        false,
      );
      assert.equal(
        doc.getElementById("tonearm").classList.contains("down"),
        false,
      );
      assert.match(doc.getElementById("elapsed").textContent, /WAITING/);
      assert.match(
        doc.querySelector(".playback-message").textContent,
        /WAIT OR SKIP/,
      );

      Object.assign(data.current, {
        playbackStatus: "playing",
        timePos: 4,
        duration: 100,
      });
      window.renderNowPlaying(data);
      assert.equal(
        doc.getElementById("platter").classList.contains("spinning"),
        true,
      );
      assert.equal(doc.getElementById("elapsed").textContent, "0:04");
      assert.equal(doc.querySelector(".playback-message"), null);

      data.current.playbackStatus = "buffering";
      window.renderNowPlaying(data);
      assert.equal(doc.getElementById("on-air-text").textContent, "BUFFERING");
      assert.equal(
        doc.getElementById("platter").classList.contains("spinning"),
        false,
      );
      await sleep(1100);
      assert.equal(doc.getElementById("elapsed").textContent, "0:04");

      data.current.playbackStatus = "playing";
      window.renderNowPlaying(data);
      assert.equal(
        doc.getElementById("platter").classList.contains("spinning"),
        true,
      );
    } finally {
      await window.refresh();
      window.startPolling();
    }
  });

  test("request fields and volume have accessible names and length limits", () => {
    for (const id of ["song-input", "name-input", "volume-slider"]) {
      assert.ok(doc.getElementById(id).getAttribute("aria-label"));
    }
    assert.equal(doc.getElementById("song-input").maxLength, 1000);
    assert.equal(doc.getElementById("name-input").maxLength, 80);
  });

  test("search can be cancelled and leaves the request available to retry", async () => {
    const window = dom.window;
    const originalFetch = window.fetch;
    window.fetch = (url, options) =>
      String(url) === "/api/queue"
        ? new Promise((_, reject) =>
            options.signal.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            ),
          )
        : originalFetch(url, options);
    try {
      doc.getElementById("song-input").value = "cancel this request";
      doc
        .getElementById("add-form")
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true }),
        );
      doc.getElementById("cancel-search").click();
      await waitFor(() => doc.getElementById("song-search").hidden);
      assert.equal(doc.querySelector(".wrap").inert, false);
      assert.equal(
        doc.getElementById("song-input").value,
        "cancel this request",
      );
      assert.equal(doc.getElementById("add-btn").disabled, false);
    } finally {
      window.fetch = originalFetch;
    }
  });

  test("idle: queue empty, reactions shown but dimmed", () => {
    assert.match(doc.getElementById("np-title").textContent, /QUEUE IS EMPTY/);
    assert.equal(doc.querySelectorAll(".reaction-btn").length, 5);
    assert.ok(doc.getElementById("reactions").classList.contains("idle"));
  });

  test("adding a song through the form starts it playing", async () => {
    const window = dom.window;

    doc.getElementById("song-input").value = "ui test song";
    doc.getElementById("name-input").value = "Tester";

    doc
      .getElementById("add-form")
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );

    assert.equal(doc.getElementById("song-search").hidden, false);
    assert.equal(doc.querySelector(".wrap").inert, true);
    assert.equal(
      doc.getElementById("add-form").getAttribute("aria-busy"),
      "true",
    );

    await waitFor(
      () =>
        /Fake: ui test song/.test(doc.getElementById("np-title").textContent),
      6000,
    );

    assert.equal(doc.getElementById("song-search").hidden, true);
    assert.equal(doc.querySelector(".wrap").inert, false);
    assert.match(
      doc.getElementById("np-by").textContent,
      /REQUESTED BY\s+Tester/,
    );
    assert.ok(doc.getElementById("on-air").classList.contains("live"));
    assert.ok(
      doc
        .getElementById("platter-art")
        .getAttribute("src")
        .startsWith("data:image/svg"),
    );
    assert.match(doc.getElementById("np-by").textContent, /\/\s*0:30/);
  });

  test("search overlay closes after server and connection errors, preserving the request", async () => {
    const window = dom.window;
    const originalFetch = window.fetch;
    try {
      for (const networkFailure of [false, true]) {
        let finish;
        window.fetch = (url, options) =>
          String(url) === "/api/queue"
            ? new Promise((resolve, reject) => {
                finish = () =>
                  networkFailure
                    ? reject(new Error("offline"))
                    : resolve({
                        ok: false,
                        json: async () => ({ error: "Lookup failed" }),
                      });
              })
            : originalFetch(url, options);
        doc.getElementById("song-input").value = "keep this request";
        doc
          .getElementById("add-form")
          .dispatchEvent(
            new window.Event("submit", { bubbles: true, cancelable: true }),
          );
        assert.equal(doc.getElementById("song-search").hidden, false);
        finish();
        await waitFor(() => doc.getElementById("song-search").hidden);
        assert.equal(doc.querySelector(".wrap").inert, false);
        assert.equal(doc.getElementById("add-btn").disabled, false);
        assert.equal(
          doc.getElementById("song-input").value,
          "keep this request",
        );
        assert.equal(
          doc.getElementById("add-form").getAttribute("aria-busy"),
          "false",
        );
      }
    } finally {
      window.fetch = originalFetch;
    }
  });

  test("the elapsed time counts up", async () => {
    const read = () => doc.getElementById("elapsed").textContent;

    await waitFor(() => read() !== "--:--");

    const first = read();

    await waitFor(() => read() !== first, 3000);
  });

  test("reactions toggle and show a floating emoji", async () => {
    assert.ok(!doc.getElementById("reactions").classList.contains("idle"));

    const fire = reactionBtn("🔥");

    fire.click();

    await waitFor(
      () => fire.querySelector(".reaction-count").textContent === "1",
    );

    assert.ok(fire.classList.contains("active"));
    assert.ok(doc.querySelectorAll(".reaction-float").length >= 1);

    fire.click();

    await waitFor(
      () => fire.querySelector(".reaction-count").textContent === "0",
    );

    assert.ok(!fire.classList.contains("active"));
  });

  test("pause and resume", async () => {
    const btn = doc.getElementById("pause-btn");

    btn.click();
    await waitFor(() => btn.dataset.paused === "true");
    assert.match(doc.getElementById("pause-btn-text").textContent, /Resume/);

    btn.click();
    await waitFor(() => btn.dataset.paused === "false");
    assert.match(doc.getElementById("pause-btn-text").textContent, /Pause/);
  });

  test("a queued song shows in the setlist, and can be removed", async () => {
    const window = dom.window;

    doc.getElementById("song-input").value = "queued song";
    doc
      .getElementById("add-form")
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );

    await waitFor(
      () => doc.querySelectorAll(".setlist-row").length === 1,
      6000,
    );
    assert.match(
      doc.querySelector(".track-title").textContent,
      /Fake: queued song/,
    );

    const remove = doc.querySelector(".remove-btn");
    remove.focus();
    await window.refresh();
    assert.equal(doc.querySelector(".remove-btn"), remove);
    assert.equal(doc.activeElement, remove);

    doc.querySelector(".remove-btn").click();

    await waitFor(() => doc.querySelectorAll(".setlist-row").length === 0);
    assert.match(
      doc.querySelector(".empty-state").textContent,
      /NOTHING QUEUED/,
    );
  });

  test("polling pauses while the tab is hidden, and resumes when shown", async () => {
    const window = dom.window;
    const setHidden = (hidden) => {
      Object.defineProperty(doc, "hidden", {
        configurable: true,
        get: () => hidden,
      });
      doc.dispatchEvent(new window.Event("visibilitychange"));
    };

    setHidden(true);

    const before = stateCalls;

    await sleep(3200);
    assert.equal(stateCalls - before, 0, "no polling while hidden");

    setHidden(false);

    await waitFor(() => stateCalls - before >= 1, 1000);
  });

  test("failed state requests show offline status and recovery clears it", async () => {
    const window = dom.window;
    await window.refresh();
    const originalFetch = window.fetch;
    try {
      window.fetch = async () => ({ ok: false, status: 503 });
      await window.refresh();
      assert.equal(doc.getElementById("connection-status").hidden, false);
      assert.equal(doc.getElementById("on-air-text").textContent, "OFFLINE");
    } finally {
      window.fetch = originalFetch;
    }
    await window.refresh();
    assert.equal(doc.getElementById("connection-status").hidden, true);
  });

  test("overlapping refreshes are serialized and request a final update", async () => {
    const window = dom.window;
    await window.refresh();
    const originalFetch = window.fetch;
    let release;
    let calls = 0;
    try {
      window.fetch = (url, options) => {
        if (String(url) !== "/api/state") return originalFetch(url, options);
        calls++;
        if (calls === 1)
          return new Promise((resolve) => {
            release = () => resolve(originalFetch(url, options));
          });
        return originalFetch(url, options);
      };
      const first = window.refresh();
      window.refresh();
      window.refresh();
      assert.equal(calls, 1);
      release();
      await first;
      await waitFor(() => calls === 2);
      await window.refresh();
    } finally {
      window.fetch = originalFetch;
    }
  });

  test("Next clears the pause button and a newly requested song starts automatically", async () => {
    const window = dom.window;
    await s.post("/api/stop-music");
    await s.post("/api/queue", { input: "Pause then skip" });
    await window.refresh();
    const pause = doc.getElementById("pause-btn");
    pause.click();
    await waitFor(() => pause.dataset.paused === "true" && !pause.disabled);
    doc.getElementById("skip-btn").click();
    await waitFor(
      () =>
        pause.dataset.paused === "false" &&
        /QUEUE IS EMPTY/.test(doc.getElementById("np-title").textContent),
    );
    assert.equal(doc.getElementById("pause-btn-text").textContent, "Pause");

    doc.getElementById("song-input").value = "Autoplay after skip";
    doc
      .getElementById("add-form")
      .dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
    await waitFor(
      () =>
        doc.getElementById("np-title").textContent ===
        "Fake: Autoplay after skip",
      6000,
    );
    assert.equal(doc.getElementById("np-eyebrow").textContent, "NOW SPINNING");
    assert.equal(doc.querySelectorAll(".setlist-row").length, 0);
    assert.equal(pause.dataset.paused, "false");
  });

  test("queue changes retain existing buttons and move focus when a track is removed", async () => {
    const window = dom.window;
    window.stopPolling();
    await window.refresh();
    try {
      const first = { id: 501, title: "First", addedBy: "Tester" };
      const second = { id: 502, title: "Second", addedBy: "Tester" };
      window.renderQueue({ queue: [first] });
      const button = doc.querySelector(".remove-btn");
      button.focus();
      window.renderQueue({ queue: [first, second] });
      assert.equal(doc.querySelector(".remove-btn"), button);
      assert.equal(doc.activeElement, button);
      window.renderQueue({ queue: [second] });
      assert.equal(doc.activeElement.dataset.id, "502");
      window.renderQueue({ queue: [] });
      assert.equal(doc.activeElement, doc.getElementById("song-input"));
    } finally {
      await window.refresh();
      window.startPolling();
    }
  });
});
