// Asks for the control PIN (skip / stop / end session) and remembers it
// on this device.

/* PIN Protected Actions */

async function callPinProtected(url, ignoreNetworkError) {
    let pin = localStorage.getItem("jukenukePin");

    if (!pin) {
        pin = prompt("ENTER THE CONTROL PIN:");

        if (pin === null) {
            return false;
        }

        pin = pin.trim();
    }

    let res;

    try {
        res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                pin,
            }),
        });
    } catch (e) {
        return !!ignoreNetworkError;
    }

    if (res.status === 403) {
        localStorage.removeItem("jukenukePin");

        const retryPin = prompt("WRONG PIN. TRY AGAIN:");

        if (retryPin === null) {
            return false;
        }

        try {
            res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    pin: retryPin.trim(),
                }),
            });
        } catch (e) {
            return !!ignoreNetworkError;
        }

        if (res.status === 403) {
            showToast("WRONG PIN — ASK FOR THE CONTROL PIN");

            return false;
        }

        localStorage.setItem("jukenukePin", retryPin.trim());

        return true;
    }

    localStorage.setItem("jukenukePin", pin);

    return true;
}
