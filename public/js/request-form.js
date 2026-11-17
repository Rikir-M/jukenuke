// The "add a song" form.

/* Add Song */
let searchController = null;
document
  .getElementById("cancel-search")
  .addEventListener("click", () => searchController?.abort());

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (addBtn.disabled) {
    return;
  }

  const input = songInput.value.trim();

  if (!input) {
    return;
  }

  addBtn.disabled = true;
  searchController = new AbortController();
  addBtnText.textContent = "SEARCHING...";
  setSongSearching(true);

  try {
    const res = await apiFetch("/api/queue", {
      signal: searchController.signal,
      timeoutMs: 35000,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input,
        addedBy: nameInput.value.trim(),
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));

      showToast(data.error || "COULD NOT ADD THAT SONG");

      return;
    }

    songInput.value = "";

    showToast("TRACK TRANSMITTED!");

    refresh();
  } catch (e) {
    showToast(
      searchController.signal.aborted
        ? "SEARCH CANCELLED"
        : "SEARCH FAILED OR TIMED OUT — PLEASE TRY AGAIN",
    );
  } finally {
    addBtn.disabled = false;
    addBtnText.textContent = "ADD TO SETLIST";
    setSongSearching(false);
    searchController = null;
  }
});
