// DISABLED — not loaded by index.html.
//
// The "scan to join" QR code. To bring it back: un-comment the join card
// in index.html and its styles in css/session.css, add a QR library
// (it uses `new QRCode(...)`) before this file, and load this file
// before main.js.

/* QR Code */

// try {
//     const joinUrl = window.location.origin;

//     document.getElementById("join-url").textContent =
//         joinUrl.replace(/^https?:\/\//, "");

//     new QRCode(document.getElementById("qrcode"), {
//         text: joinUrl,
//         width: 84,
//         height: 84,
//         colorDark: "#17151b",
//         colorLight: "#fff0bd",
//     });
// } catch (e) {
//     document.getElementById("join-url").textContent =
//         window.location.origin;
// }
