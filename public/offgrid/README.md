# Off-Grid Preview: how to open it

## Why you saw `ERR_CONNECTION_REFUSED`
That means no local server was running on that port yet (or it was started in the wrong folder).

## Windows (PowerShell/CMD) quick start
1. Open terminal.
2. Go to the repo folder (NOT `C:\Windows\System32`):

```powershell
cd C:\path\to\leantime
```

3. Start preview server:

```powershell
npm run offgrid:preview
```

4. Open in browser:

- `http://127.0.0.1:8000/public/offgrid/preview.html`

If you need LAN access from another device, run:

```powershell
npm run offgrid:preview:all
```

Then use your PC IP address in browser, for example:

- `http://192.168.1.50:8000/public/offgrid/preview.html`

## If npm says `ENOENT ... package.json`
You are in the wrong directory. Run from your repo root where `package.json` exists.

Check location:

```powershell
dir package.json
```

If not found, `cd` into the project first.

## About `@types/react` install failures in this environment
If this environment blocks npm registry access (`403`), use the offline shim fallback:

```bash
npm run types:react:shim
```

This creates local shim typings at:

- `node_modules/@types/react/index.d.ts`
- `node_modules/@types/react-dom/client.d.ts`

It is a fallback for restricted environments and avoids needing network access.
