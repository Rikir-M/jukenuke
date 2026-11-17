# Security

JukeNuke is intended for a trusted local network. Publishing the source does
not make the running server suitable for public internet access.

## Deployment boundaries

- The server listens on all network interfaces. Do not forward its port on
  your router or expose it through a public tunnel.
- Anyone who can reach it can add/remove songs, pause/resume, adjust volume,
  and read the queue and recent history, including requester names.
- PIN protection is temporarily disabled. Anyone who can reach the app can
  skip, stop, and shut down the session. The original PIN code is retained
  in comments for restoration.
- Traffic uses HTTP. Keep the PIN private and use a trusted network.
- Lookup slots are reserved before work starts: one per IP, at most four
  across the server, with a 30-second deadline. Disconnected requests cancel
  their lookups. Successful requests start the IP cooldown; failures release
  the reservation without consuming it. IP limits are shared by users behind
  the same network address and reset when the server restarts.

Before exposing a deployment to untrusted users, add authentication, request
and login rate limits, and HTTPS.

## Private files

Keep `data/`, environment files, credentials, logs and `node_modules/` out of
commits. The data files contain song requests, requester names and history.
Never paste real PINs or private configuration into bug reports.

## Reporting an issue

Do not post credentials, private data or exploit details in a public issue.
If the GitHub repository offers private vulnerability reporting, use its
Security tab to report a vulnerability privately. Otherwise contact the
maintainer privately before disclosing details.
