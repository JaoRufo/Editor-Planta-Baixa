import { createId } from "../core/math.js";

export function createAnnotation(selection, text) {
  const width = Math.max(selection.width, 80);
  const height = Math.max(selection.height, 30);

  return {
    id: createId("annotation"),
    page: selection.page,
    x: selection.x,
    y: selection.y,
    width,
    height,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function updateAnnotation(annotations, annotationId, updates) {
  return annotations.map((annotation) => {
    if (annotation.id !== annotationId) {
      return annotation;
    }

    return {
      ...annotation,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function deleteAnnotation(annotations, annotationId) {
  return annotations.filter((annotation) => annotation.id !== annotationId);
}

export function getAnnotationsForPage(annotations, page) {
  return annotations.filter((annotation) => annotation.page === page);
}
