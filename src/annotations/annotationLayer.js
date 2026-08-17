import { pdfToViewerCoordinates } from "../core/coordinates.js";
import { getAnnotationsForPage } from "./annotationStore.js";

export function renderAnnotationLayer({
  layerElement,
  annotations,
  currentPage,
  selectedAnnotationId,
  viewerState,
  onPointerDown,
}) {
  const pageAnnotations = getAnnotationsForPage(annotations, currentPage);

  layerElement.innerHTML = "";

  for (const annotation of pageAnnotations) {
    const textTopLeft = pdfToViewerCoordinates(
      viewerState,
      annotation.textX ?? annotation.x,
      annotation.textY ?? annotation.y + annotation.height,
    );
    const element = document.createElement("button");

    element.type = "button";
    element.className = "annotation-item";
    element.classList.toggle("is-selected", annotation.id === selectedAnnotationId);
    element.dataset.annotationId = annotation.id;
    element.textContent = annotation.text;
    element.style.left = `${textTopLeft.x}px`;
    element.style.top = `${textTopLeft.y}px`;
    element.style.maxWidth = `${Math.max(annotation.width * viewerState.zoom, 80)}px`;
    element.style.minHeight = "30px";

    element.addEventListener("pointerdown", onPointerDown);
    layerElement.appendChild(element);
  }
}
