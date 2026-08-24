Fireground Command Board v6 — LIVE SYNC BACKEND

This package is NOT for Netlify static hosting.

It contains:
- server.js
- package.json
- render.yaml

The command board frontend can run without this.
Deploy this only when you are ready to test live sharing between devices.

After the backend is deployed, copy its HTTPS address into:
Share Incident > Sync Server URL

The command board automatically changes https:// to wss:// for the live connection.
