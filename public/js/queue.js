// The setlist: drawing the waiting songs, and removing one.

function renderQueue(data) {
    queueList.innerHTML = "";

    if (!data.queue.length) {
        queueList.innerHTML = `
    <div class="empty-state">
        NOTHING QUEUED — BE THE FIRST
    </div>
    `;
    } else {
        data.queue.forEach((item, i) => {
            const row = document.createElement("div");

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
                ${escapeHtml(item.addedBy || "someone")}
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

            queueList.appendChild(row);
        });
    }
}

/* Remove Queued Track */

queueList.addEventListener("click", async (e) => {
    if (e.target.matches("button[data-id]")) {
        const id = e.target.getAttribute("data-id");

        await fetch("/api/queue/" + id, {
            method: "DELETE",
        });

        refresh();
    }
});
