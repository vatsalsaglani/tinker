const LOG_LEVEL_PRIORITY = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const DEFAULT_LOG_LEVEL = "info";
const MAX_SERIALIZED_ARG_LENGTH = 2000;
const MAX_LOG_LINE_LENGTH = 8000;

class LoggerCore {
  constructor() {
    this.outputChannel = null;
    this.logLevel = DEFAULT_LOG_LEVEL;
    this.revealOnError = false;
    this.buffer = [];
  }

  initialize({ outputChannel, level = DEFAULT_LOG_LEVEL, revealOnError = false } = {}) {
    this.outputChannel = outputChannel || this.outputChannel;
    this.setLevel(level);
    this.setRevealOnError(revealOnError);
    this._flushBufferedLines();
  }

  setLevel(level) {
    if (!Object.prototype.hasOwnProperty.call(LOG_LEVEL_PRIORITY, level)) {
      this.logLevel = DEFAULT_LOG_LEVEL;
      return;
    }
    this.logLevel = level;
  }

  setRevealOnError(revealOnError) {
    this.revealOnError = Boolean(revealOnError);
  }

  child(scope) {
    return new ScopedLogger(this, scope || "Tinker");
  }

  show(preserveFocus = false) {
    this.outputChannel?.show(preserveFocus);
  }

  _flushBufferedLines() {
    if (!this.outputChannel || this.buffer.length === 0) {
      return;
    }

    for (const line of this.buffer) {
      this.outputChannel.appendLine(line);
    }
    this.buffer = [];
  }

  _isEnabled(level) {
    const currentPriority = LOG_LEVEL_PRIORITY[this.logLevel] ?? LOG_LEVEL_PRIORITY.info;
    const messagePriority = LOG_LEVEL_PRIORITY[level] ?? LOG_LEVEL_PRIORITY.info;
    return messagePriority <= currentPriority;
  }

  _appendLine(line) {
    if (this.outputChannel) {
      this.outputChannel.appendLine(line);
      return;
    }
    this.buffer.push(line);
  }

  _redactString(value) {
    if (typeof value !== "string" || value.length === 0) {
      return value;
    }

    let result = value;
    result = result.replace(
      /(authorization["']?\s*[:=]\s*["']?)([^"',\s]+)/gi,
      "$1[REDACTED]"
    );
    result = result.replace(
      /(bearer\s+)([a-z0-9\-._~+/=]+)/gi,
      "$1[REDACTED]"
    );
    result = result.replace(
      /(api[_-]?key["']?\s*[:=]\s*["']?)([^"',\s]+)/gi,
      "$1[REDACTED]"
    );
    result = result.replace(
      /(aws[_-]?secret[_-]?key["']?\s*[:=]\s*["']?)([^"',\s]+)/gi,
      "$1[REDACTED]"
    );
    result = result.replace(
      /(token["']?\s*[:=]\s*["']?)([^"',\s]+)/gi,
      "$1[REDACTED]"
    );
    return result;
  }

  _isSensitiveKey(key) {
    if (!key) return false;
    return /api[_-]?key|authorization|token|secret|password|credential|aws[_-]?secret/i.test(
      key
    );
  }

  _safeStringify(value) {
    const seen = new WeakSet();

    const replacer = (key, currentValue) => {
      if (this._isSensitiveKey(key)) {
        return "[REDACTED]";
      }

      if (typeof currentValue === "string") {
        return this._redactString(currentValue);
      }

      if (
        currentValue &&
        typeof currentValue === "object" &&
        !(currentValue instanceof Date)
      ) {
        if (seen.has(currentValue)) {
          return "[Circular]";
        }
        seen.add(currentValue);
      }

      if (currentValue instanceof Error) {
        return {
          name: currentValue.name,
          message: currentValue.message,
          stack: currentValue.stack,
        };
      }

      return currentValue;
    };

    try {
      return JSON.stringify(value, replacer);
    } catch (error) {
      return `"[Unserializable: ${error.message}]"`;
    }
  }

  _normalizeArg(arg) {
    if (typeof arg === "string") {
      const redacted = this._redactString(arg);
      return redacted.length > MAX_SERIALIZED_ARG_LENGTH
        ? `${redacted.slice(0, MAX_SERIALIZED_ARG_LENGTH)}...[truncated]`
        : redacted;
    }

    const serialized = this._safeStringify(arg);
    if (serialized.length > MAX_SERIALIZED_ARG_LENGTH) {
      return `${serialized.slice(0, MAX_SERIALIZED_ARG_LENGTH)}...[truncated]`;
    }
    return serialized;
  }

  _formatTimestamp(date = new Date()) {
    return date.toISOString().substring(11, 23);
  }

  log(level, scope, message, ...args) {
    if (!this._isEnabled(level)) {
      return;
    }

    const normalizedLevel = (level || "info").toUpperCase();
    const normalizedScope = scope || "Tinker";
    const normalizedMessage =
      typeof message === "string" ? this._redactString(message) : this._normalizeArg(message);
    const serializedArgs = args.map((arg) => this._normalizeArg(arg)).join(" ");

    let line = `[${this._formatTimestamp()}] [${normalizedLevel}] [${normalizedScope}] ${normalizedMessage}`;
    if (serializedArgs) {
      line += ` ${serializedArgs}`;
    }

    if (line.length > MAX_LOG_LINE_LENGTH) {
      line = `${line.slice(0, MAX_LOG_LINE_LENGTH)}...[truncated]`;
    }

    this._appendLine(line);

    if (level === "error" && this.revealOnError) {
      this.show(false);
    }
  }
}

class ScopedLogger {
  constructor(core, scope) {
    this.core = core;
    this.scope = scope || "Tinker";
  }

  child(scope) {
    if (!scope) {
      return new ScopedLogger(this.core, this.scope);
    }
    return new ScopedLogger(this.core, `${this.scope}:${scope}`);
  }

  error(message, ...args) {
    this.core.log("error", this.scope, message, ...args);
  }

  warn(message, ...args) {
    this.core.log("warn", this.scope, message, ...args);
  }

  info(message, ...args) {
    this.core.log("info", this.scope, message, ...args);
  }

  debug(message, ...args) {
    this.core.log("debug", this.scope, message, ...args);
  }

  show(preserveFocus = false) {
    this.core.show(preserveFocus);
  }
}

const loggerCore = new LoggerCore();

function getLogger() {
  return loggerCore;
}

module.exports = {
  getLogger,
  LOG_LEVELS: Object.keys(LOG_LEVEL_PRIORITY),
};
