#!/usr/bin/env bash
set -euo pipefail

mkdir -p node_modules/@types/react node_modules/@types/react-dom

cat > node_modules/@types/react/index.d.ts <<'DTS'
declare module 'react' {
  const React: any;
  export = React;
  export const useState: any;
  export const useMemo: any;
  export const useEffect: any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
DTS

cat > node_modules/@types/react-dom/client.d.ts <<'DTS'
declare module 'react-dom/client' {
  export const createRoot: any;
}
DTS

echo "Installed local shim type definitions into node_modules/@types (offline fallback)."
