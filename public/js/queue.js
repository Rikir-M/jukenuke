// The setlist: drawing the waiting songs, and removing one.

let lastQueue = "";
function renderQueue(data) {
  const signature = JSON.stringify(data.queue);
  if (signature === lastQueue) return;
  lastQueue = signature;
  const focusedId = queueList.contains(document.activeElement)
    ? document.activeElement.dataset.id
    : null;
  const rows = new Map(
    [...queueList.querySelectorAll(".setlist-row")].map((row) => [
      Number(row.querySelector("button").dataset.id),
      row,
    ]),
  );
  const activeIndex = [...rows.keys()].indexOf(Number(focusedId));
  // Keep existing rows attached when possible, preserving their buttons and focus.

  if (!data.queue.length) {
    queueList.innerHTML = `
    <div class="empty-state">
        NOTHING QUEUED — BE THE FIRST
    </div>
    `;
  } else {
    data.queue.forEach((item, i) => {
      let row = rows.get(item.id);
      if (row) {
        row.querySelector(".track-no").textContent = String(i + 1).padStart(
          2,
          "0",
        );
        row.querySelector(".track-title").textContent = item.title;
        row.querySelector(".track-by").textContent =
          `ADDED BY ${item.addedBy || "SOMEONE"}`;
        rows.delete(item.id);
        const at = queueList.children[i];
        if (at !== row) queueList.insertBefore(row, at || null);
        return;
      }
      row = document.createElement("div");

      row.className = "setlist-row";

      row.innerHTML = `
        <div class="track-no">
            ${String(i + 1).padStart(2, "0")}
        </div>

        <div class="track-meta">
            <div class="track-title">
                ${escapeHtml(item.title)}
            </div>

            <div class="track-by">
                ADDED BY
                ${escapeHtml(item.addedBy || "SOMEONE")}
            </div>
        </div>

        <button
            class="remove-btn"
            data-id="${item.id}"
            aria-label="Remove"
        >
            ✕
        </button>
    `;

      queueList.querySelector(".empty-state")?.remove();
      queueList.insertBefore(row, queueList.children[i] || null);
    });
  }
  rows.forEach((row) => row.remove());
  if (focusedId) {
    const button =
      queueList.querySelector(`button[data-id="${focusedId}"]`) ||
      queueList.querySelectorAll("button")[
        Math.min(activeIndex, data.queue.length - 1)
      ];
    (button || songInput).focus({ preventScroll: true });
  }
}

/* Remove Queued Track */

queueList.addEventListener("click", async (e) => {
  if (e.target.matches("button[data-id]")) {
    const id = e.target.getAttribute("data-id");

    try {
      const res = await apiFetch("/api/queue/" + id, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Remove rejected");
      refresh();
    } catch (e) {
      showToast("COULD NOT REMOVE THAT SONG");
    }
  }
});
