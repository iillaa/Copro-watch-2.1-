const MAX_DIAG_LOGS = 2000;

const toSafeObject = (value) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }

  return value;
};

const pushDiagLog = (level, args) => {
  if (!window.__COPRO_DEV_LOGS__) window.__COPRO_DEV_LOGS__ = [];

  const entry = {
    ts: new Date().toISOString(),
    level,
    args: args.map(toSafeObject),
    href: window.location.href,
  };

  window.__COPRO_DEV_LOGS__.push(entry);
  if (window.__COPRO_DEV_LOGS__.length > MAX_DIAG_LOGS) {
    window.__COPRO_DEV_LOGS__.shift();
  }
};

export const initDiagnostics = () => {
  if (window.__COPRO_DIAGNOSTICS_READY__) return;
  window.__COPRO_DIAGNOSTICS_READY__ = true;

  const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'];
  const originalConsole = {};

  consoleMethods.forEach((method) => {
    originalConsole[method] = console[method].bind(console);
    console[method] = (...args) => {
      pushDiagLog(method.toUpperCase(), args);
      originalConsole[method](...args);
    };
  });

  window.addEventListener('error', (event) => {
    pushDiagLog('WINDOW_ERROR', [
      event.message,
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: toSafeObject(event.error),
      },
    ]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    pushDiagLog('UNHANDLED_REJECTION', [toSafeObject(event.reason)]);
  });

  window.dumpDiagnostics = () => {
    const dump = JSON.stringify(window.__COPRO_DEV_LOGS__ || [], null, 2);
    console.log('[DIAG] dumpDiagnostics generated', { count: window.__COPRO_DEV_LOGS__?.length || 0 });
    return dump;
  };

  console.log('[DIAG] Extended diagnostics enabled');
};
