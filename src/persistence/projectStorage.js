const STORAGE_KEY = "editor-planta-baixa.project.v1";

export function saveProjectState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      state,
    }),
  );
}

export function loadProjectState() {
  const rawState = localStorage.getItem(STORAGE_KEY);

  if (!rawState) {
    return null;
  }

  const parsed = JSON.parse(rawState);

  if (parsed?.version !== 1) {
    throw new Error("Versao de projeto local nao suportada.");
  }

  return parsed.state || null;
}

export function clearProjectState() {
  localStorage.removeItem(STORAGE_KEY);
}
