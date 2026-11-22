const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(
  path.join(__dirname, "../public/index.html"),
  "utf8",
);
const script = fs.readFileSync(
  path.join(__dirname, "../public/js/appearance.js"),
  "utf8",
);

function load(saved, blocked = false, cookie = "") {
  const dom = new JSDOM(html, {
    url: "http://localhost",
    runScripts: "outside-only",
  });
  if (saved) dom.window.localStorage.setItem("jukenuke-interface", saved);
  if (cookie) dom.window.document.cookie = cookie;
  if (blocked)
    Object.defineProperty(dom.window, "localStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    });
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return dom;
}

test("all interfaces switch without replacing player, queue or unfinished request", () => {
  const dom = load();
  try {
    const doc = dom.window.document;
    const player = doc.getElementById("platter");
    const queue = doc.getElementById("queue-list");
    const input = doc.getElementById("song-input");
    const readout = doc.querySelector(".track-readout");
    const title = doc.getElementById("np-title");
    title.textContent = "A playing track";
    input.value = "Keep my request";
    player.classList.add("spinning");
    for (const value of ["studio", "tape", "classic"]) {
      doc.querySelector(`[data-interface="${value}"]`).click();
      assert.equal(doc.documentElement.dataset.ui, value);
      assert.equal(
        doc.querySelectorAll('[data-interface][aria-pressed="true"]').length,
        1,
      );
      assert.equal(
        doc.querySelector('[data-interface][aria-pressed="true"]').dataset
          .interface,
        value,
      );
      assert.equal(
        dom.window.localStorage.getItem("jukenuke-interface"),
        value,
      );
      assert.equal(doc.getElementById("platter"), player);
      assert.equal(doc.getElementById("queue-list"), queue);
      assert.ok(player.classList.contains("spinning"));
      assert.equal(input.value, "Keep my request");
      assert.equal(
        doc
          .querySelector(".feedback-row")
          .classList.contains("feedback-row--cassette"),
        value === "tape",
      );
      assert.equal(
        doc.querySelector(".volume-row").parentElement,
        doc.querySelector(value === "tape" ? ".feedback-row" : ".deck"),
      );
      assert.equal(doc.getElementById("np-title"), title);
      assert.equal(title.textContent, "A playing track");
      assert.equal(
        readout.parentElement,
        doc.querySelector(value === "tape" ? ".cassette-label" : ".np-info"),
      );
      assert.equal(readout.closest('[aria-hidden="true"]'), null);
      assert.equal(
        doc.querySelector(".session-menu").open,
        value === "classic",
      );
    }
  } finally {
    dom.window.close();
  }
});

test("interface introduction is dismissed by acknowledgment or selection and remembered by cookie", () => {
  for (const selector of [
    "#dismiss-interface-intro",
    "#interface-backdrop",
    '[data-interface="studio"]',
  ]) {
    const dom = load();
    let cookie;
    try {
      const doc = dom.window.document;
      assert.equal(doc.getElementById("interface-intro").hidden, false);
      assert.equal(doc.getElementById("interface-backdrop").hidden, false);
      assert.ok(
        doc.querySelector(".interface-picker").classList.contains("is-new"),
      );
      doc.querySelector(selector).click();
      assert.equal(doc.getElementById("interface-intro").hidden, true);
      assert.equal(doc.getElementById("interface-backdrop").hidden, true);
      assert.equal(
        doc.querySelector(".interface-picker").classList.contains("is-new"),
        false,
      );
      cookie = doc.cookie;
      assert.match(cookie, /jukenuke-interface-intro-v1=1/);
    } finally {
      dom.window.close();
    }
    const returning = load(null, false, cookie);
    try {
      assert.equal(
        returning.window.document.getElementById("interface-intro").hidden,
        true,
      );
    } finally {
      returning.window.close();
    }
  }
});

test("Escape dismisses the spotlight and restores focus to the active interface", () => {
  const dom = load();
  try {
    const doc = dom.window.document;
    doc.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    assert.equal(doc.getElementById("interface-intro").hidden, true);
    assert.equal(doc.getElementById("interface-backdrop").hidden, true);
    assert.equal(
      doc.activeElement,
      doc.querySelector('[data-interface][aria-pressed="true"]'),
    );
    assert.equal(
      doc.querySelector(".interface-picker").hasAttribute("aria-describedby"),
      false,
    );
    assert.match(doc.cookie, /jukenuke-interface-intro-v1=1/);
  } finally {
    dom.window.close();
  }
});

test("saved interfaces restore and unknown preferences fall back to Classic", () => {
  for (const saved of ["studio", "tape", "classic", "unknown"]) {
    const dom = load(saved);
    try {
      const expected = saved === "unknown" ? "classic" : saved;
      assert.equal(dom.window.document.documentElement.dataset.ui, expected);
      assert.equal(
        dom.window.document.querySelector(".track-readout").parentElement,
        dom.window.document.querySelector(
          expected === "tape" ? ".cassette-label" : ".np-info",
        ),
      );
      assert.equal(
        dom.window.document.querySelector(
          '[data-interface][aria-pressed="true"]',
        ).dataset.interface,
        expected,
      );
    } finally {
      dom.window.close();
    }
  }
});

test("switching remains usable when local storage is blocked", () => {
  const dom = load(null, true);
  try {
    dom.window.document.querySelector('[data-interface="tape"]').click();
    assert.equal(dom.window.document.documentElement.dataset.ui, "tape");
  } finally {
    dom.window.close();
  }
});
