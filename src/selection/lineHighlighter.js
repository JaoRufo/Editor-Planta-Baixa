import { pdfToViewerCoordinates } from "../core/coordinates.js";
import { clamp } from "../core/math.js";

export function detectLineHighlightsForSelection({
  selection,
  pdfCanvas,
  pdfCanvasContext,
  viewerState,
  onReadError,
}) {
  if (!selection || selection.page !== viewerState.currentPage) {
    return [];
  }

  const outputScale = pdfCanvas.width / viewerState.renderedWidth || 1;
  const sourceRect = getCanvasSourceRectFromPdfSelection(
    selection,
    outputScale,
    pdfCanvas,
    viewerState,
  );

  if (sourceRect.width <= 0 || sourceRect.height <= 0) {
    return [];
  }

  let imageData;

  try {
    imageData = pdfCanvasContext.getImageData(
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
    );
  } catch (error) {
    onReadError?.(error);
    return [];
  }

  const cells = new Map();
  const sourceArea = sourceRect.width * sourceRect.height;
  const sampleStep = Math.max(1, Math.floor(Math.sqrt(sourceArea / 160000)));
  const cellSize = Math.max(3, Math.round(outputScale * 4));

  for (let y = 0; y < sourceRect.height; y += sampleStep) {
    for (let x = 0; x < sourceRect.width; x += sampleStep) {
      const index = (y * sourceRect.width + x) * 4;
      const red = imageData.data[index];
      const green = imageData.data[index + 1];
      const blue = imageData.data[index + 2];
      const alpha = imageData.data[index + 3];

      if (!isDarkLinePixel(red, green, blue, alpha)) {
        continue;
      }

      const cellX = Math.floor(x / cellSize);
      const cellY = Math.floor(y / cellSize);

      cells.set(`${cellX}:${cellY}`, { cellX, cellY });
    }
  }

  return [...cells.values()]
    .slice(0, 6000)
    .map(({ cellX, cellY }) =>
      sourceCellToPdfRect(
        selection.page,
        sourceRect.x + cellX * cellSize,
        sourceRect.y + cellY * cellSize,
        cellSize,
        outputScale,
        viewerState,
      ),
    );
}

export function renderLineHighlights({
  canvas,
  context,
  highlights,
  viewerElement,
  viewerState,
}) {
  resizeHighlightCanvas(canvas, context, viewerElement);
  clearLineHighlights({ context, viewerElement });

  if (!highlights.length) {
    return;
  }

  context.fillStyle = "rgba(255, 214, 46, 0.34)";
  context.strokeStyle = "rgba(255, 204, 0, 0.72)";
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const highlight of highlights) {
    if (highlight.page !== viewerState.currentPage) {
      continue;
    }

    if (highlight.points?.length >= 2) {
      drawVectorHighlight(context, highlight, viewerState);
      continue;
    }

    const topLeft = pdfToViewerCoordinates(
      viewerState,
      highlight.x,
      highlight.y + highlight.height,
    );
    const bottomRight = pdfToViewerCoordinates(
      viewerState,
      highlight.x + highlight.width,
      highlight.y,
    );

    context.fillRect(
      topLeft.x,
      topLeft.y,
      Math.max(bottomRight.x - topLeft.x, 1),
      Math.max(bottomRight.y - topLeft.y, 1),
    );
  }
}

export function clearLineHighlights({ context, viewerElement }) {
  context.clearRect(
    0,
    0,
    viewerElement.clientWidth,
    viewerElement.clientHeight,
  );
}

function getCanvasSourceRectFromPdfSelection(
  selection,
  outputScale,
  pdfCanvas,
  viewerState,
) {
  const renderedZoom = viewerState.renderedZoom || viewerState.zoom;
  const sourceX = Math.floor(selection.x * renderedZoom * outputScale);
  const sourceY = Math.floor(
    (viewerState.pageHeight - selection.y - selection.height) *
      renderedZoom *
      outputScale,
  );
  const sourceWidth = Math.ceil(
    selection.width * renderedZoom * outputScale,
  );
  const sourceHeight = Math.ceil(
    selection.height * renderedZoom * outputScale,
  );
  const x = clamp(sourceX, 0, pdfCanvas.width);
  const y = clamp(sourceY, 0, pdfCanvas.height);

  return {
    x,
    y,
    width: clamp(sourceWidth, 0, pdfCanvas.width - x),
    height: clamp(sourceHeight, 0, pdfCanvas.height - y),
  };
}

function sourceCellToPdfRect(
  page,
  sourceX,
  sourceY,
  sourceSize,
  outputScale,
  viewerState,
) {
  const renderedZoom = viewerState.renderedZoom || viewerState.zoom;
  const pdfX = sourceX / outputScale / renderedZoom;
  const pdfTopY =
    viewerState.pageHeight - sourceY / outputScale / renderedZoom;
  const pdfSize = sourceSize / outputScale / renderedZoom;

  return {
    page,
    x: pdfX,
    y: pdfTopY - pdfSize,
    width: pdfSize,
    height: pdfSize,
  };
}

function isDarkLinePixel(red, green, blue, alpha) {
  if (alpha < 32) {
    return false;
  }

  const average = (red + green + blue) / 3;
  const contrast = Math.max(red, green, blue) - Math.min(red, green, blue);

  return average < 145 && contrast < 90;
}

function resizeHighlightCanvas(canvas, context, viewerElement) {
  const outputScale = window.devicePixelRatio || 1;
  const width = Math.max(
    1,
    Math.floor(viewerElement.clientWidth * outputScale),
  );
  const height = Math.max(
    1,
    Math.floor(viewerElement.clientHeight * outputScale),
  );

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
}

function drawVectorHighlight(context, item, viewerState) {
  const firstPoint = pdfToViewerCoordinates(
    viewerState,
    item.points[0].x,
    item.points[0].y,
  );

  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);

  for (const point of item.points.slice(1)) {
    const viewerPoint = pdfToViewerCoordinates(viewerState, point.x, point.y);

    context.lineTo(viewerPoint.x, viewerPoint.y);
  }

  if (item.closed) {
    context.closePath();
  }

  context.lineWidth = Math.max(2, Math.min(8, viewerState.zoom * 2.5));
  context.stroke();
}
