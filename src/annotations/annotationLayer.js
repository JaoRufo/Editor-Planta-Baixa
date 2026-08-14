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
    const topLeft = pdfToViewerCoordinates(
      viewerState,
      annotation.x,
      annotation.y + annotation.height,
    );
    const bottomRight = pdfToViewerCoordinates(
      viewerState,
      annotation.x + annotation.width,
      annotation.y,
    );
    const element = document.createElement("button");

    element.type = "button";
    element.className = "annotation-item";
    element.classList.toggle("is-selected", annotation.id === selectedAnnotationId);
    element.dataset.annotationId = annotation.id;
    element.textContent = annotation.text;
    element.style.left = `${topLeft.x}px`;
    element.style.top = `${topLeft.y}px`;
    element.style.width = `${bottomRight.x - topLeft.x}px`;
    element.style.minHeight = `${Math.max(bottomRight.y - topLeft.y, 30)}px`;

    element.addEventListener("pointerdown", onPointerDown);
    layerElement.appendChild(element);
  }
}
