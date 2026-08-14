const LOG_PREFIX = "[Editor Planta Baixa]";

export function log(message, data = null) {
  if (data !== null) {
    console.log(`${LOG_PREFIX} ${message}`, data);
    return;
  }

  console.log(`${LOG_PREFIX} ${message}`);
}

export function logWarning(message, data = null) {
  if (data !== null) {
    console.warn(`${LOG_PREFIX} ${message}`, data);
    return;
  }

  console.warn(`${LOG_PREFIX} ${message}`);
}

export function logError(message, error = null) {
  if (error !== null) {
    console.error(`${LOG_PREFIX} ${message}`, error);
    return;
  }

  console.error(`${LOG_PREFIX} ${message}`);
}
