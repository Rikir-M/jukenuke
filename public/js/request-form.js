// The "add a song" form.

/* Add Song */

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
    addBtnText.textContent = "SEARCHING...";
    setSongSearching(true);

    try {
        const res = await fetch("/api/queue", {
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
        showToast("COULD NOT CONNECT TO JUKENUKE");
    } finally {
        addBtn.disabled = false;
        addBtnText.textContent = "ADD TO SETLIST";
        setSongSearching(false);
    }
});
