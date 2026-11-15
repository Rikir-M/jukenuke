# Security

JukeNuke is intended for a trusted local network. Publishing the source does
not make the running server suitable for public internet access.

## Deployment boundaries

- The server listens on all network interfaces. Do not forward its port on
  your router or expose it through a public tunnel.
- Anyone who can reach it can add/remove songs, pause/resume, adjust volume,
  and read the queue and recent history, including requester names.
- Skip, stop, and shutdown require a control PIN. The default is four digits;
  PIN attempts are not rate limited. This is a convenience control, not
  strong authentication.
- Traffic uses HTTP. Keep the PIN private and use a trusted network.
- Song-add limits are recorded after lookup completes. Concurrent requests
  can bypass these limits and launch multiple yt-dlp processes. Lookups have
  no application timeout.

Before exposing a deployment to untrusted users, add authentication, request
and login rate limits, bounded lookup concurrency/timeouts, and HTTPS.

## Private files

Keep `data/`, environment files, credentials, logs and `node_modules/` out of
commits. The data files contain song requests, requester names and history.
Never paste real PINs or private configuration into bug reports.

## Reporting an issue

Do not post credentials, private data or exploit details in a public issue.
If the GitHub repository offers private vulnerability reporting, use its
Security tab to report a vulnerability privately. Otherwise contact the
maintainer privately before disclosing details.
