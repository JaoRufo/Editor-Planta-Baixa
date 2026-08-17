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
    const textElement = document.createElement("span");
    const resizeHandle = document.createElement("span");
    const rotateHandle = document.createElement("span");
    const textWidth = annotation.textWidth ?? annotation.width;
    const textHeight = annotation.textHeight ?? annotation.height;
    const renderedWidth = Math.max(textWidth * viewerState.zoom, 24);
    const renderedHeight = Math.max(textHeight * viewerState.zoom, 18);

    element.type = "button";
    element.className = "annotation-item";
    element.classList.toggle("is-selected", annotation.id === selectedAnnotationId);
    element.dataset.annotationId = annotation.id;
    element.style.left = `${textTopLeft.x}px`;
    element.style.top = `${textTopLeft.y}px`;
    element.style.width = `${renderedWidth}px`;
    element.style.height = `${renderedHeight}px`;
    element.style.transform = `rotate(${annotation.textRotation || 0}deg)`;

    textElement.className = "annotation-text";
    textElement.textContent = annotation.text;
    textElement.style.fontSize = `${calculateResponsiveTextSize(
      annotation.text,
      renderedWidth,
      renderedHeight,
    )}px`;

    resizeHandle.className = "annotation-handle annotation-resize-handle";
    resizeHandle.dataset.annotationAction = "resize";
    resizeHandle.setAttribute("aria-hidden", "true");

    rotateHandle.className = "annotation-handle annotation-rotate-handle";
    rotateHandle.dataset.annotationAction = "rotate";
    rotateHandle.setAttribute("aria-hidden", "true");

    element.addEventListener("pointerdown", onPointerDown);
    element.appendChild(textElement);
    element.appendChild(resizeHandle);
    element.appendChild(rotateHandle);
    layerElement.appendChild(element);
  }
}

function calculateResponsiveTextSize(text, width, height) {
  const availableWidth = Math.max(width - 2, 1);
  const availableHeight = Math.max(height - 2, 1);
  let min = 1;
  let max = Math.min(48, availableHeight);

  for (let step = 0; step < 8; step += 1) {
    const size = (min + max) / 2;

    if (doesTextFit(text, availableWidth, availableHeight, size)) {
      min = size;
    } else {
      max = size;
    }
  }

  return Math.max(1, min);
}

function doesTextFit(text, width, height, fontSize) {
  const normalizedText = String(text).trim() || " ";
  const averageCharacterWidth = fontSize * 0.56;
  const maxCharactersPerLine = Math.max(
    1,
    Math.floor(width / averageCharacterWidth),
  );
  const lineHeight = fontSize * 1.05;
  const lineCount = estimateWrappedLineCount(
    normalizedText,
    maxCharactersPerLine,
  );

  return lineCount * lineHeight <= height;
}

function estimateWrappedLineCount(text, maxCharactersPerLine) {
  const words = text.split(/\s+/);
  let lines = 1;
  let currentLineLength = 0;

  for (const word of words) {
    if (word.length > maxCharactersPerLine) {
      const remainingCharacters = Math.max(
        maxCharactersPerLine - currentLineLength,
        0,
      );
      const overflowLength = Math.max(word.length - remainingCharacters, 0);

      lines += Math.ceil(overflowLength / maxCharactersPerLine);
      currentLineLength = word.length % maxCharactersPerLine;
      continue;
    }

    const nextLength = currentLineLength
      ? currentLineLength + 1 + word.length
      : word.length;

    if (nextLength > maxCharactersPerLine) {
      lines += 1;
      currentLineLength = word.length;
    } else {
      currentLineLength = nextLength;
    }
  }

  return lines;
}
