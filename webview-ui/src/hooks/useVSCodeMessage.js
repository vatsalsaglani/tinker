import { useEffect } from "react";
import { createUILogger } from "../utils/ui-logger";

// Get VS Code API instance
const vscode =
  typeof acquireVsCodeApi !== "undefined" ? acquireVsCodeApi() : null;
if (typeof window !== "undefined" && vscode) {
  window.__tinkerVsCodeApi = vscode;
}
const uiLogger = createUILogger("VSCodeMessage");

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
        uiLogger.warn("VS Code API not available", message);
      }
    },
    getState: () => vscode?.getState() || {},
    setState: (state) => vscode?.setState(state),
  };
}

export default useVSCodeMessage;
