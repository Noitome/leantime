declare module 'react' {
  const React: any;
  export = React;
  export const useState: any;
  export const useMemo: any;
  export const useEffect: any;
}

declare module 'react-dom/client' {
  export const createRoot: any;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
