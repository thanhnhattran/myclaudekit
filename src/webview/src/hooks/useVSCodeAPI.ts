import { useMemo } from 'react';

// Type for the VS Code API available in webviews
interface VSCodeAPI {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

// Declare the acquireVsCodeApi function that's available in VS Code webviews
declare function acquireVsCodeApi(): VSCodeAPI;

/**
 * Hook to access the VS Code API in webview
 * Memoized to ensure we only acquire the API once
 */
export function useVSCodeAPI(): VSCodeAPI {
  return useMemo(() => {
    // In development mode (outside VS Code), provide a mock
    if (typeof acquireVsCodeApi === 'undefined') {
      console.warn('VS Code API not available, using mock');
      return {
        postMessage: (msg: unknown) => console.log('postMessage:', msg),
        getState: () => null,
        setState: (state: unknown) => console.log('setState:', state)
      };
    }
    return acquireVsCodeApi();
  }, []);
}
