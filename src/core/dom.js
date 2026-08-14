import { logError } from "./logger.js";

export function getRequiredElements(selectors) {
  const elements = {};

  for (const [name, selector] of Object.entries(selectors)) {
    const element = document.querySelector(selector);

    if (!element) {
      logError(`Elemento obrigatorio nao encontrado: ${name}`);
    }

    elements[name] = element;
  }

  return elements;
}
