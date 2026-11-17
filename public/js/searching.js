// The request overlay owns its animation: no animation loop runs while hidden.
const setSongSearching = (() => {
  const overlay = document.getElementById("song-search");
  const app = document.querySelector(".wrap");
  const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let previousFocus;
  let animation;
  let frame;

  function createAnimation() {
    if (!window.matchMedia || !overlay.querySelector("path").getTotalLength)
      return;

    const svg = overlay.querySelector("svg");
    const ns = svg.namespaceURI;
    const eyeParts = [...svg.children].filter(
      (el) => el.tagName === "ellipse" && +el.getAttribute("cy") > 60,
    );
    const gaze = document.createElementNS(ns, "g");
    svg.append(gaze);
    for (let i = 0; i < eyeParts.length; i += 2) {
      const blink = document.createElementNS(ns, "g");
      blink.classList.add("eye");
      blink.append(eyeParts[i], eyeParts[i + 1]);
      gaze.append(blink);
    }
    const tail = [...svg.children].find(
      (el) =>
        el.tagName === "path" && el.getAttribute("d")?.startsWith("M96.3538"),
    );
    const original = tail.getAttribute("d");
    // Sample from the attached base toward the tip. Preserve every segment's length.
    const length = tail.getTotalLength();
    const rest = Array.from({ length: 25 }, (_, i) =>
      tail.getPointAtLength(length * (1 - i / 24)),
    );
    const bones = rest.slice(1).map((p, i) => ({
      length: Math.hypot(p.x - rest[i].x, p.y - rest[i].y),
      angle: Math.atan2(p.y - rest[i].y, p.x - rest[i].x),
    }));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stops = [
      [0, 0, 0],
      [0.7, -5, -1],
      [2, -5, -1],
      [2.7, 5, -2],
      [4.2, 5, -2],
      [4.9, 0, -5],
      [6, 0, -5],
      [6.7, 0, 0],
      [8, 0, 0],
    ];
    function look(t) {
      const phase = t % 8;
      const i = stops.findIndex(
        (p, i) =>
          i < stops.length - 1 && phase >= p[0] && phase < stops[i + 1][0],
      );
      const a = stops[Math.max(i, 0)],
        b = stops[Math.max(i, 0) + 1];
      let u = (phase - a[0]) / (b[0] - a[0]);
      u = u * u * (3 - 2 * u);
      return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    }
    let start;
    function animate(now) {
      if (overlay.hidden || document.hidden || motion.matches) return;
      start ??= now;
      const t = (now - start) / 1000;
      if (motion.matches) {
        tail.setAttribute("d", original);
        gaze.removeAttribute("transform");
      } else {
        const [x, y] = look(t);
        gaze.setAttribute("transform", `translate(${x} ${y})`);
        const pts = [{ x: rest[0].x, y: rest[0].y }];
        for (let i = 0; i < bones.length; i++) {
          const s = (i + 1) / bones.length;
          // A traveling bend follows the tail, with greater flexibility near its tip.
          const wave = Math.sin(t * 1.8 - s * 3.2) * 0.48 * s;
          const phase = (((t - s * 0.35) % 7) + 7) % 7;
          const flick =
            phase > 4.5 && phase < 6
              ? Math.sin(((phase - 4.5) / 1.5) * Math.PI) ** 2 *
                Math.sin((phase - 4.5) * 6) *
                0.6 *
                s *
                s
              : 0;
          const angle = bones[i].angle + wave + flick;
          pts.push({
            x: pts[i].x + Math.cos(angle) * bones[i].length,
            y: pts[i].y + Math.sin(angle) * bones[i].length,
          });
        }
        // Interpolate a smooth curve through the articulated chain.
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[Math.max(0, i - 1)],
            b = pts[i],
            c = pts[i + 1],
            e = pts[Math.min(pts.length - 1, i + 2)];
          d += ` C ${b.x + (c.x - a.x) / 6} ${b.y + (c.y - a.y) / 6} ${c.x - (e.x - b.x) / 6} ${c.y - (e.y - b.y) / 6} ${c.x} ${c.y}`;
        }
        tail.setAttribute("d", d);
      }
      frame = requestAnimationFrame(animate);
    }
    return {
      start() {
        start = undefined;
        frame = requestAnimationFrame(animate);
      },
      stop() {
        cancelAnimationFrame(frame);
        tail.setAttribute("d", original);
        gaze.removeAttribute("transform");
      },
    };
  }

  function updateAnimation() {
    animation?.stop();
    if (!overlay.hidden && !document.hidden && !motion?.matches)
      animation?.start();
  }

  document.addEventListener("visibilitychange", updateAnimation);
  motion?.addEventListener("change", updateAnimation);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape")
      document.getElementById("cancel-search").click();
    if (event.key === "Tab") {
      event.preventDefault();
      document.getElementById("cancel-search").focus();
    }
  });

  return (searching) => {
    overlay.hidden = !searching;
    app.inert = searching;
    form.setAttribute("aria-busy", String(searching));
    document.body.classList.toggle("song-searching", searching);
    if (searching) {
      previousFocus = document.activeElement;
      overlay.focus({ preventScroll: true });
      animation ??= createAnimation();
    }
    updateAnimation();
    if (!searching && previousFocus?.isConnected) {
      // The submit button is re-enabled by the caller before restoring focus.
      previousFocus.focus({ preventScroll: true });
    }
  };
})();
