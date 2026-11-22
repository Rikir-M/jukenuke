const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("cassette knob drags, clamps, posts volume and follows server updates", async () => {
  const dom = new JSDOM(
    fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8"),
    { runScripts: "outside-only" },
  );
  const win = dom.window;
  const doc = win.document;
  const sent = [];
  win.apiFetch = async (url, options) => {
    sent.push([url, JSON.parse(options.body).volume]);
    return { ok: true };
  };
  win.refresh = () => {};
  win.showToast = () => assert.fail("Unexpected volume error");
  win.eval(
    fs.readFileSync(path.join(__dirname, "../public/js/dom.js"), "utf8") +
      "\n" +
      fs.readFileSync(path.join(__dirname, "../public/js/volume.js"), "utf8"),
  );
  const input = doc.getElementById("volume-slider");
  input.setPointerCapture = () => {};
  input.hasPointerCapture = () => false;
  input.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 88,
    height: 88,
  });
  const pointer = (type, x, y) => {
    const event = new win.Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y });
    input.dispatchEvent(event);
    return event;
  };
  const turn = (type, angle) =>
    pointer(
      type,
      44 + 40 * Math.sin((angle * Math.PI) / 180),
      44 - 40 * Math.cos((angle * Math.PI) / 180),
    );
  try {
    doc.documentElement.dataset.ui = "studio";
    assert.equal(pointer("pointerdown", 0, 100).defaultPrevented, false);
    pointer("pointermove", 100, 0);
    assert.equal(input.value, "80");
    doc.documentElement.dataset.ui = "tape";
    assert.equal(turn("pointerdown", 0).defaultPrevented, true);
    assert.equal(input.value, "80", "grabbing at another angle must not jump");
    turn("pointermove", 40.5);
    assert.equal(input.value, "95");
    assert.equal(doc.getElementById("volume-value").textContent, "95");
    assert.equal(
      input.parentElement.style.getPropertyValue("--volume-fill"),
      "95%",
    );
    assert.equal(
      input.parentElement.style.getPropertyValue("--knob-angle"),
      "121.5deg",
    );
    win.syncVolume({ volume: 10 });
    assert.equal(input.value, "95", "polling must not interrupt a drag");
    turn("pointermove", 90);
    assert.equal(input.value, "100");
    turn("pointermove", 170);
    turn("pointermove", -170);
    assert.equal(
      input.value,
      "100",
      "crossing the angular seam must not wrap to zero",
    );
    turn("pointermove", -179);
    assert.equal(
      input.value,
      "97",
      "reversing from the limit responds immediately",
    );
    pointer("pointermove", 44, 44);
    assert.equal(
      input.value,
      "97",
      "passing through the center must not jitter",
    );
    turn("pointermove", -179);
    turn("pointermove", -90);
    turn("pointermove", 0);
    turn("pointermove", -90);
    turn("pointermove", -179);
    turn("pointermove", 100);
    turn("pointermove", 80);
    assert.equal(input.value, "0");
    turn("pointerup", 80);
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.deepEqual(sent, [["/api/volume", 0]]);
    win.syncVolume({ volume: 50 });
    assert.equal(input.value, "50");
    assert.equal(
      input.parentElement.style.getPropertyValue("--volume-fill"),
      "50%",
    );
    assert.equal(
      input.parentElement.style.getPropertyValue("--knob-angle"),
      "0deg",
    );
    assert.equal(
      input.type,
      "range",
      "native range semantics and keyboard behavior are retained",
    );
  } finally {
    win.close();
  }
});
