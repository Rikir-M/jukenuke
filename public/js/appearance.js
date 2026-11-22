// Apply before styles load, so a saved interface never flashes Classic.
(() => {
  const key = "jukenuke-interface";
  const valid = new Set(["classic", "studio", "tape"]);
  let selected = "classic";
  try {
    const saved = localStorage.getItem(key);
    if (valid.has(saved)) selected = saved;
  } catch {
    // The interface still works when browser storage is unavailable.
  }
  document.documentElement.dataset.ui = selected;
  document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll("[data-interface]");
    const intro = document.getElementById("interface-intro");
    const backdrop = document.getElementById("interface-backdrop");
    const picker = document.querySelector(".interface-picker");
    const introCookie = "jukenuke-interface-intro-v1";
    let introSeen = false;
    try {
      introSeen = document.cookie
        .split(";")
        .some((cookie) => cookie.trim() === `${introCookie}=1`);
    } catch {
      /* Show the introduction when cookies are unavailable. */
    }
    intro.hidden = introSeen;
    backdrop.hidden = introSeen;
    if (!introSeen)
      picker.setAttribute("aria-describedby", "interface-intro-description");
    picker.classList.toggle("is-new", !introSeen);
    const dismissIntro = () => {
      intro.hidden = true;
      backdrop.hidden = true;
      picker.classList.remove("is-new");
      picker.removeAttribute("aria-describedby");
      try {
        document.cookie = `${introCookie}=1; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      } catch {
        /* Dismiss for this page even if cookies are blocked. */
      }
    };
    backdrop.addEventListener("click", dismissIntro);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !intro.hidden) {
        dismissIntro();
        document.querySelector('[data-interface][aria-pressed="true"]').focus();
      }
    });
    document
      .getElementById("dismiss-interface-intro")
      .addEventListener("click", () => {
        dismissIntro();
        document.querySelector('[data-interface][aria-pressed="true"]').focus();
      });
    const session = document.querySelector(".session-menu");
    const readout = document.querySelector(".track-readout");
    const readoutHome = document.createComment("Now-playing readout position");
    readout.before(readoutHome);
    const cassetteLabel = document.querySelector(".cassette-label");
    const volume = document.querySelector(".volume-row");
    const volumeHome = document.createComment("Volume control position");
    volume.before(volumeHome);
    const feedback = document.querySelector(".feedback-row");
    const syncReadout = () => {
      feedback.classList.toggle("feedback-row--cassette", selected === "tape");
      if (selected === "tape") {
        cassetteLabel.append(readout);
        feedback.append(volume);
      } else {
        readoutHome.after(readout);
        volumeHome.after(volume);
      }
    };
    syncReadout();
    const syncButtons = () =>
      buttons.forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.interface === selected),
        );
      });
    syncButtons();
    session.open = selected === "classic";
    buttons.forEach((button) =>
      button.addEventListener("click", () => {
        if (!valid.has(button.dataset.interface)) return;
        dismissIntro();
        selected = button.dataset.interface;
        document.documentElement.dataset.ui = selected;
        syncButtons();
        syncReadout();
        session.open = selected === "classic";
        try {
          localStorage.setItem(key, selected);
        } catch {
          // Keep the selection for this page even if it cannot be saved.
        }
      }),
    );
  });
})();
