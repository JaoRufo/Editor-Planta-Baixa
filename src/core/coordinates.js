import { clamp } from "./math.js";

export function viewerToCanvasCoordinates(viewerState, viewerX, viewerY) {
  return {
    x: (viewerX - viewerState.panX) / viewerState.zoom,
    y: (viewerY - viewerState.panY) / viewerState.zoom,
  };
}

export function canvasToPdfCoordinates(viewerState, canvasX, canvasY) {
  return {
    x: canvasX,
    y: viewerState.pageHeight - canvasY,
  };
}

export function viewerToPdfCoordinates(viewerState, viewerX, viewerY) {
  const canvasPoint = viewerToCanvasCoordinates(viewerState, viewerX, viewerY);

  return canvasToPdfCoordinates(viewerState, canvasPoint.x, canvasPoint.y);
}

export function pdfToViewerCoordinates(viewerState, pdfX, pdfY) {
  const canvasX = pdfX;
  const canvasY = viewerState.pageHeight - pdfY;

  return {
    x: viewerState.panX + canvasX * viewerState.zoom,
    y: viewerState.panY + canvasY * viewerState.zoom,
  };
}

export function getViewerCoordinatesFromEvent(viewerElement, event) {
  const rect = viewerElement.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function clampPdfPoint(viewerState, pdfPoint) {
  return {
    x: clamp(pdfPoint.x, 0, viewerState.pageWidth),
    y: clamp(pdfPoint.y, 0, viewerState.pageHeight),
  };
}

export function isPdfPointInsidePage(viewerState, pdfPoint) {
  return (
    pdfPoint.x >= 0 &&
    pdfPoint.x <= viewerState.pageWidth &&
    pdfPoint.y >= 0 &&
    pdfPoint.y <= viewerState.pageHeight
  );
}
