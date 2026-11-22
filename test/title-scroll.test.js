const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("titles scroll only when overflowing and preserve their span between polls", () => {
  const dom = new JSDOM('<div id="title"></div>', {
    runScripts: "outside-only",
  });
  const win = dom.window;
  try {
    win.eval(
      fs.readFileSync(
        path.join(__dirname, "../public/js/title-scroll.js"),
        "utf8",
      ),
    );
    const title = win.document.getElementById("title");
    let available = 100;
    Object.defineProperty(title, "clientWidth", { get: () => available });
    win.setScrollingTitle(title, "A very long song title");
    const span = title.firstElementChild;
    Object.defineProperty(span, "scrollWidth", { get: () => 250 });
    win.measureAllTitles();
    assert.equal(title.classList.contains("title-overflow"), true);
    assert.equal(title.style.getPropertyValue("--title-distance"), "-150px");
    assert.equal(title.title, "A very long song title");
    win.setScrollingTitle(title, "A very long song title");
    assert.equal(title.firstElementChild, span);
    available = 300;
    win.dispatchEvent(new win.Event("resize"));
    assert.equal(title.classList.contains("title-overflow"), false);
    win.setScrollingTitle(title, '<img src=x onerror="alert(1)">');
    assert.equal(title.querySelector("img"), null);
    assert.equal(title.textContent, '<img src=x onerror="alert(1)">');
    title.remove();
    win.measureAllTitles();
  } finally {
    win.close();
  }
});
