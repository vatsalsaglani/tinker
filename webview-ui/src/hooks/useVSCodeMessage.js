import { useEffect } from "react";

// Get VS Code API instance
const vscode =
  typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;

/**
 * Hook to handle VS Code webview messaging
 * @param {Function} handler - Callback to handle messages
 * @returns {Object} - VS Code API with postMessage method
 */
export function useVSCodeMessage(handler) {
  useEffect(() => {
    if (!handler) return;

    const messageHandler = (event) => {
      const message = event.data;
      handler(message);
    };

    window.addEventListener("message", messageHandler);

    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }, [handler]);

  return {
    postMessage: (message) => {
      if (vscode) {
        vscode.postMessage(message);
      } else {
        console.warn("VS Code API not available:", message);
      }
    },
    getState: () => vscode?.getState() || {},
    setState: (state) => vscode?.setState(state),
  };
}

export default useVSCodeMessage;
