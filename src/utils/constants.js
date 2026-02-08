/**
 * Tinker Debug Constants
 * Central place to control debug logging across the extension
 */

// Keep disabled by default for production; enable only for local debugging.
const DEBUG_LOGGING_ENABLED = false;

// Debug log directory (relative to home directory)
const DEBUG_LOG_DIR = ".tinker-debug";

module.exports = {
  DEBUG_LOGGING_ENABLED,
  DEBUG_LOG_DIR,
};
