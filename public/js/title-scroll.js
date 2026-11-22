// Keep the same title node between polls so the animation isn't restarted.
const scrollingTitles = new Map();
const titleResizeObserver =
  typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          const element = entry.target.matches(".title-text")
            ? entry.target.parentElement
            : entry.target;
          if (scrollingTitles.has(element)) measureTitle(element);
        }
      })
    : null;

function measureTitle(element) {
  const text = scrollingTitles.get(element);
  if (!text || !element.isConnected) {
    if (text) {
      titleResizeObserver?.unobserve(element);
      titleResizeObserver?.unobserve(text);
      scrollingTitles.delete(element);
    }
    return;
  }
  const distance = Math.max(0, text.scrollWidth - element.clientWidth);
  const overflowing = element.clientWidth > 0 && distance > 1;
  element.classList.toggle("title-overflow", overflowing);
  element.style.setProperty("--title-distance", `${-distance}px`);
}

function setScrollingTitle(element, value) {
  const title = String(value || "");
  let text = scrollingTitles.get(element);
  if (!text || text.parentElement !== element) {
    text = document.createElement("span");
    text.className = "title-text";
    element.replaceChildren(text);
    scrollingTitles.set(element, text);
    titleResizeObserver?.observe(element);
    titleResizeObserver?.observe(text);
  }
  if (text.textContent !== title) {
    text.textContent = title;
    element.title = title;
    element.classList.remove("title-overflow");
  }
  measureTitle(element);
}

function measureAllTitles() {
  scrollingTitles.forEach((_, element) => measureTitle(element));
}
window.addEventListener("resize", measureAllTitles);
document.fonts?.ready.then(measureAllTitles);
