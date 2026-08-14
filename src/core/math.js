export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function roundZoom(value) {
  return Math.round(value * 10) / 10;
}

export function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
