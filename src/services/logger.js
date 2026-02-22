/**
 * Centralized Logging & Error Handling System for Copro-Watch
 */
const LOG_LEVELS = { INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR', FATAL: 'FATAL' };

class Logger {
  constructor() {
    this.logs = [];
    this.maxLogs = 500;
  }

  formatMessage(level, message, context = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };
  }

  log(level, message, context) {
    const entry = this.formatMessage(level, message, context);
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) this.logs.pop();
    
    const consoleMethod = level === LOG_LEVELS.ERROR || level === LOG_LEVELS.FATAL ? 'error' : 'log';
    console[consoleMethod](`[${entry.level}] ${message}`, context);
    
    // In Capacitor, we also want to ensure it hits the native logcat
    if (window.Capacitor && window.Capacitor.Plugins.Console) {
      console.log(`[NATIVE_LOG] ${message}`);
    }
  }

  info(msg, ctx) { this.log(LOG_LEVELS.INFO, msg, ctx); }
  warn(msg, ctx) { this.log(LOG_LEVELS.WARN, msg, ctx); }
  error(msg, ctx) { this.log(LOG_LEVELS.ERROR, msg, ctx); }
  fatal(msg, ctx) { this.log(LOG_LEVELS.FATAL, msg, ctx); }

  getLogs() { return this.logs; }
  
  clear() { this.logs = []; }
}

export const logger = new Logger();

export const handleApiError = (error, context = '') => {
  const status = error.response?.status || 500;
  const message = error.response?.data?.message || error.message || 'Unknown error';
  
  logger.error(`API Error [${status}]: ${context} - ${message}`, {
    stack: error.stack,
    data: error.response?.data
  });

  return {
    success: false,
    status,
    message,
    timestamp: new Date().toISOString()
  };
};
