const MAX_STRING_LENGTH = 2000;
const MAX_ARGS = 10;
let acquireAttempted = false;

function getVSCodeApi() {
  if (typeof window !== "undefined" && window.__tinkerVsCodeApi) {
    return window.__tinkerVsCodeApi;
  }

  if (typeof acquireVsCodeApi === "undefined") {
    return null;
  }

  if (acquireAttempted) {
    return null;
  }

  acquireAttempted = true;

  try {
    const api = acquireVsCodeApi();
    if (typeof window !== "undefined") {
      window.__tinkerVsCodeApi = api;
    }
    return api;
  } catch {
    return null;
  }
}

function truncateString(value) {
  if (typeof value !== "string") {
    return value;
  }
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitizeValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message || ""),
      stack: truncateString(value.stack || ""),
    };
  }

  if (typeof value === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARGS).map((item) => sanitizeValue(item, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = sanitizeValue(entry, seen);
    }
    return result;
  }

  return String(value);
}

function postToExtension(payload) {
  const vscode = getVSCodeApi();
  if (!vscode) return;

  try {
    vscode.postMessage(payload);
  } catch {
    // no-op: UI logger should never throw
  }
}

function toMessageString(message) {
  if (typeof message === "string") {
    return truncateString(message);
  }
  try {
    return truncateString(JSON.stringify(sanitizeValue(message)));
  } catch {
    return "[Unserializable UI log message]";
  }
}

export function createUILogger(source = "Webview") {
  const normalizedSource = source || "Webview";

  const emit = (level, message, ...args) => {
    postToExtension({
      type: "uiLog",
      source: normalizedSource,
      level,
      message: toMessageString(message),
      args: args.slice(0, MAX_ARGS).map((arg) => sanitizeValue(arg)),
      timestamp: new Date().toISOString(),
    });
  };

  return {
    error: (message, ...args) => emit("error", message, ...args),
    warn: (message, ...args) => emit("warn", message, ...args),
    info: (message, ...args) => emit("info", message, ...args),
    debug: (message, ...args) => emit("debug", message, ...args),
  };
}

export function installGlobalErrorHandlers(logger) {
  if (typeof window === "undefined" || window.__tinkerUiErrorHandlersInstalled) {
    return;
  }

  window.__tinkerUiErrorHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    logger.error("Unhandled UI error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (reason instanceof Error) {
      logger.error("Unhandled promise rejection", {
        message: reason.message,
        stack: reason.stack,
      });
      return;
    }
    logger.error("Unhandled promise rejection", reason);
  });
}
