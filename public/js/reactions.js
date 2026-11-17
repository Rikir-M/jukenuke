// Reaction buttons under the song, and the emojis that float up.

/* Reactions */

// Shown straight away (and when previewing the page without a
// server). Once the server answers, its list takes over.
const DEFAULT_REACTIONS = ["🔥", "❤️", "😂", "👏", "😴"];

const reactionButtons = new Map();
const demoReactions = new Set(); // local-only votes, no server
let currentSongId = null;
let lastReactionCounts = null;
let serverReachable = false;
let reactionRequest = 0;

function spawnReactionFloat(emoji) {
  const el = document.createElement("span");

  el.className = "reaction-float";
  el.textContent = emoji;
  el.style.left = `${8 + Math.random() * 80}%`;

  reactionsEl.appendChild(el);

  el.addEventListener("animationend", () => el.remove());
  setTimeout(() => el.remove(), 2500);
}

function applyReactions(counts, mine, animate) {
  // Drop buttons the server doesn't offer (anymore).
  reactionButtons.forEach((btn, emoji) => {
    if (!(emoji in counts)) {
      btn.remove();
      reactionButtons.delete(emoji);
    }
  });

  Object.keys(counts).forEach((emoji) => {
    let btn = reactionButtons.get(emoji);

    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reaction-btn";
      btn.dataset.emoji = emoji;
      btn.setAttribute("aria-label", `React with ${emoji}`);
      btn.innerHTML = `
                <span class="reaction-emoji"></span>
                <span class="reaction-count"></span>
            `;
      btn.querySelector(".reaction-emoji").textContent = emoji;

      reactionsEl.appendChild(btn);
      reactionButtons.set(emoji, btn);
    }

    btn.querySelector(".reaction-count").textContent = counts[emoji];

    const isMine = mine.includes(emoji);

    btn.classList.toggle("active", isMine);
    btn.setAttribute("aria-pressed", String(isMine));

    // Float an emoji up for each new reaction someone
    // else gave since the last poll.
    if (animate && lastReactionCounts) {
      const gained = Math.min(
        counts[emoji] - (lastReactionCounts[emoji] || 0),
        3,
      );

      for (let i = 0; i < gained; i++) {
        setTimeout(() => spawnReactionFloat(emoji), i * 150);
      }
    }
  });

  lastReactionCounts = { ...counts };
}

function zeroCounts() {
  const counts = {};

  reactionButtons.forEach((btn, emoji) => {
    counts[emoji] = 0;
  });

  return counts;
}

function renderReactions(current) {
  // Nothing playing: keep the buttons, dimmed, counts at zero.
  reactionsEl.classList.toggle("idle", !current);

  if (!current) {
    currentSongId = null;
    applyReactions(zeroCounts(), [], false);
    return;
  }

  // A new song starts from zero — don't animate the reset.
  const songChanged = current.id !== currentSongId;

  currentSongId = current.id;

  applyReactions(
    current.reactions || {},
    current.myReactions || [],
    !songChanged,
  );
}

applyReactions(
  Object.fromEntries(DEFAULT_REACTIONS.map((e) => [e, 0])),
  [],
  false,
);

reactionsEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".reaction-btn");

  if (!btn) {
    return;
  }

  const emoji = btn.dataset.emoji;

  if (currentSongId === null) {
    if (serverReachable) {
      showToast("NOTHING PLAYING YET");
      return;
    }

    // No server (e.g. previewing the page): toggle locally
    // so the buttons can still be tried out.
    if (demoReactions.has(emoji)) {
      demoReactions.delete(emoji);
    } else {
      demoReactions.add(emoji);
    }

    const counts = zeroCounts();

    demoReactions.forEach((e2) => {
      if (e2 in counts) counts[e2] = 1;
    });

    applyReactions(counts, [...demoReactions], false);

    if (demoReactions.has(emoji)) {
      spawnReactionFloat(emoji);
    }

    return;
  }

  const songId = currentSongId;
  const request = ++reactionRequest;
  try {
    const res = await apiFetch("/api/react", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        songId,
        emoji,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (currentSongId !== songId || request !== reactionRequest) return;

    if (!res.ok) {
      // The song changed or stopped between the tap and
      // the request — just resync with the server.
      if (res.status === 409) {
        refresh();
        return;
      }

      showToast("COULD NOT SEND THAT REACTION");
      return;
    }

    applyReactions(data.reactions, data.myReactions, false);

    if (data.myReactions.includes(emoji)) {
      spawnReactionFloat(emoji);
    }
  } catch (err) {
    if (currentSongId !== songId || request !== reactionRequest) return;
    showToast("COULD NOT CONNECT TO JUKE NUKE");
  }
});
