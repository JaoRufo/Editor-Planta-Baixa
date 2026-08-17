import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import "./style.css";

import { getRequiredElements } from "./core/dom.js";
import {
  clampPdfPoint,
  getViewerCoordinatesFromEvent,
  isPdfPointInsidePage,
  pdfToViewerCoordinates,
  viewerToCanvasCoordinates,
  viewerToPdfCoordinates,
} from "./core/coordinates.js";
import { log, logError, logWarning } from "./core/logger.js";
import { clamp, roundZoom } from "./core/math.js";
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from "./annotations/annotationStore.js";
import { renderAnnotationLayer } from "./annotations/annotationLayer.js";
import { loadIfcModel } from "./ifc/ifcService.js";
import {
  clearProjectState,
  loadProjectState,
  saveProjectState,
} from "./persistence/projectStorage.js";
import {
  createPdfPolygonSelection,
  isPdfPointInsideSelection,
  normalizePdfSelection,
} from "./selection/selectionGeometry.js";
import {
  clearLineHighlights as clearLineHighlightsLayer,
  detectLineHighlightsForSelection as detectLineHighlightsFromCanvas,
  renderLineHighlights as renderLineHighlightLayer,
} from "./selection/lineHighlighter.js";
import {
  extractPdfVectorItems,
  findPdfVectorItemsForSelection,
} from "./selection/pdfVectorExtractor.js";
import { renderSelectionPanel } from "./ui/selectionPanel.js";

const PDF_FILE = "/assets/pdf/layout/planta-layout.pdf";
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;
const INITIAL_ZOOM = 1;
const ZOOM_RENDER_DELAY = 220;
const RENDER_SCHEDULER = "requestAnimationFrame";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const ui = getRequiredElements({
  loading: "#loading",
  error: "#error",
  errorMessage: "#errorMessage",
  viewer: "#viewer",
  canvasContainer: "#canvasContainer",
  canvas: "#pdfCanvas",
  lineHighlightCanvas: "#lineHighlightCanvas",
  annotationLayer: "#annotationLayer",
  currentPage: "#currentPage",
  totalPages: "#totalPages",
  zoomValue: "#zoomValue",
  statusMessage: "#statusMessage",
  previousPageButton: "#previousPageButton",
  nextPageButton: "#nextPageButton",
  panModeButton: "#panModeButton",
  selectionModeButton: "#selectionModeButton",
  polygonSelectionButton: "#polygonSelectionButton",
  saveProjectButton: "#saveProjectButton",
  loadProjectButton: "#loadProjectButton",
  clearProjectButton: "#clearProjectButton",
  zoomOutButton: "#zoomOutButton",
  zoomInButton: "#zoomInButton",
  resetViewButton: "#resetViewButton",
  selectionOverlay: "#selectionOverlay",
  selectionPanel: "#selectionPanel",
  selectionPanelContent: "#selectionPanelContent",
  clearSelectionButton: "#clearSelectionButton",
  confirmDialog: "#confirmDialog",
  confirmDialogTitle: "#confirmDialogTitle",
  confirmDialogMessage: "#confirmDialogMessage",
  confirmCancelButton: "#confirmCancelButton",
  confirmAcceptButton: "#confirmAcceptButton",
});

const canvasContext = ui.canvas.getContext("2d", { alpha: false });
const lineHighlightContext = ui.lineHighlightCanvas.getContext("2d");

const viewerState = {
  pdfDocument: null,
  currentPage: 1,
  totalPages: 0,
  zoom: INITIAL_ZOOM,
  pageWidth: 0,
  pageHeight: 0,
  renderedWidth: 0,
  renderedHeight: 0,
  renderedZoom: INITIAL_ZOOM,
  panX: 0,
  panY: 0,
  isPanning: false,
  interactionMode: "pan",
  pointerStartX: 0,
  pointerStartY: 0,
  panStartX: 0,
  panStartY: 0,
  isSelecting: false,
  selectionShapeMode: "rectangle",
  selectionStartPdf: null,
  polygonPointsPdf: [],
  polygonPreviewPdf: null,
  renderTask: null,
  renderRequestId: null,
  zoomRenderTimeoutId: null,
  renderVersion: 0,
  renderInProgress: false,
  renderPending: false,
  lastWheelLogTime: 0,
  vectorItemsByPage: new Map(),
};

const projectState = {
  activeSelection: null,
  selections: [],
  lineHighlights: [],
  selectedPdfItems: [],
  annotations: [],
  selectedAnnotationId: null,
  ifcModel: null,
};

let annotationDrag = null;
let confirmDialogAction = null;

const MIN_TEXT_WIDTH = 10;
const MIN_TEXT_HEIGHT = 8;

function setStatus(message) {
  ui.statusMessage.textContent = message;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function getNumericInputValue(id, fallback) {
  const value = Number(document.getElementById(id)?.value);

  return Number.isFinite(value) ? value : fallback;
}

function rotateViewerDelta(deltaX, deltaY, degrees) {
  const radians = (-degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: deltaX * cos - deltaY * sin,
    y: deltaX * sin + deltaY * cos,
  };
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

function cloneSelection(selection) {
  return {
    ...selection,
    points: selection.points?.map((point) => ({ x: point.x, y: point.y })) || null,
  };
}

function getSelectionSignature(selection) {
  const points = selection.points?.length
    ? selection.points
    : [
        { x: selection.x, y: selection.y },
        { x: selection.x + selection.width, y: selection.y },
        { x: selection.x + selection.width, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height },
      ];

  return [
    selection.page,
    selection.type || "rectangle",
    ...points.flatMap((point) => [Math.round(point.x), Math.round(point.y)]),
  ].join(":");
}

function addPersistentSelection(selection) {
  const signature = getSelectionSignature(selection);

  if (
    projectState.selections.some(
      (existingSelection) => getSelectionSignature(existingSelection) === signature,
    )
  ) {
    return;
  }

  projectState.selections = [...projectState.selections, cloneSelection(selection)];
}

function updateZoomInterface() {
  ui.zoomValue.textContent = `${Math.round(viewerState.zoom * 100)}%`;
  ui.zoomOutButton.disabled = viewerState.zoom <= MIN_ZOOM;
  ui.zoomInButton.disabled = viewerState.zoom >= MAX_ZOOM;
}

function updatePageInterface() {
  ui.currentPage.textContent = viewerState.currentPage;
  ui.totalPages.textContent = viewerState.totalPages;
  ui.previousPageButton.disabled = viewerState.currentPage <= 1;
  ui.nextPageButton.disabled = viewerState.currentPage >= viewerState.totalPages;
}

function getViewerCenter() {
  return {
    x: ui.viewer.clientWidth / 2,
    y: ui.viewer.clientHeight / 2,
  };
}

function applyCanvasTransform() {
  const visualScale = viewerState.zoom / viewerState.renderedZoom;

  ui.canvasContainer.style.transform = `matrix(${visualScale}, 0, 0, ${visualScale}, ${viewerState.panX}, ${viewerState.panY})`;
  renderLineHighlights();
  updateSelectionOverlay();
  renderAnnotations();
}

function centerPage() {
  const center = getViewerCenter();
  const pageWidth = viewerState.pageWidth || viewerState.renderedWidth;
  const pageHeight = viewerState.pageHeight || viewerState.renderedHeight;

  viewerState.panX = center.x - (pageWidth * viewerState.zoom) / 2;
  viewerState.panY = center.y - (pageHeight * viewerState.zoom) / 2;

  applyCanvasTransform();

  log("Planta centralizada", {
    panX: Math.round(viewerState.panX),
    panY: Math.round(viewerState.panY),
    zoom: viewerState.zoom,
  });
}

function cancelCurrentRender(reason = "Nova renderizacao solicitada.") {
  if (!viewerState.renderTask) {
    return;
  }

  log(`Cancelando renderizacao atual: ${reason}`);

  try {
    viewerState.renderTask.cancel();
  } catch (error) {
    logWarning("Nao foi possivel cancelar a renderizacao atual.", error);
  }

  viewerState.renderTask = null;
  viewerState.renderInProgress = false;
}

async function renderCurrentPage() {
  if (!viewerState.pdfDocument) {
    logWarning("Tentativa de renderizacao sem PDF carregado.");
    return;
  }

  cancelCurrentRender("Renderizacao mais recente solicitada.");

  const renderVersion = ++viewerState.renderVersion;

  viewerState.renderInProgress = true;
  viewerState.renderPending = false;

  log(`Iniciando renderizacao da pagina ${viewerState.currentPage}.`, {
    version: renderVersion,
    zoom: viewerState.zoom,
  });

  setStatus(`Renderizando pagina ${viewerState.currentPage}...`);

  try {
    const page = await viewerState.pdfDocument.getPage(viewerState.currentPage);

    if (renderVersion !== viewerState.renderVersion) {
      logWarning("Renderizacao ignorada por existir uma versao mais recente.");
      return;
    }

    const viewport = page.getViewport({ scale: viewerState.zoom });
    const outputScale = window.devicePixelRatio || 1;

    viewerState.pageWidth = page.view[2] - page.view[0];
    viewerState.pageHeight = page.view[3] - page.view[1];
    viewerState.renderedWidth = viewport.width;
    viewerState.renderedHeight = viewport.height;
    viewerState.renderedZoom = viewerState.zoom;

    ui.canvas.width = Math.ceil(viewport.width * outputScale);
    ui.canvas.height = Math.ceil(viewport.height * outputScale);
    ui.canvas.style.width = `${viewport.width}px`;
    ui.canvas.style.height = `${viewport.height}px`;

    canvasContext.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    const renderTask = page.render({ canvasContext, viewport });
    viewerState.renderTask = renderTask;

    await renderTask.promise;

    if (renderVersion !== viewerState.renderVersion) {
      logWarning("Renderizacao concluida, mas descartada por versao recente.");
      return;
    }

    viewerState.renderTask = null;
    viewerState.renderInProgress = false;

    updateZoomInterface();
    updatePageInterface();
    applyCanvasTransform();

    setStatus(`Pagina ${viewerState.currentPage} carregada`);
    queuePdfVectorExtraction(page, viewerState.currentPage, renderVersion);

    log(`Pagina ${viewerState.currentPage} renderizada com sucesso.`, {
      pageWidth: Math.round(viewerState.pageWidth),
      pageHeight: Math.round(viewerState.pageHeight),
      renderedWidth: Math.round(viewerState.renderedWidth),
      renderedHeight: Math.round(viewerState.renderedHeight),
      zoom: viewerState.zoom,
      version: renderVersion,
    });
  } catch (error) {
    if (error?.name === "RenderingCancelledException") {
      log("Renderizacao cancelada normalmente.", { version: renderVersion });
      return;
    }

    if (renderVersion !== viewerState.renderVersion) {
      logWarning("Erro de renderizacao antiga ignorado.", error);
      return;
    }

    viewerState.renderTask = null;
    viewerState.renderInProgress = false;
    logError(`Erro ao renderizar a pagina ${viewerState.currentPage}.`, error);
    throw error;
  } finally {
    if (renderVersion === viewerState.renderVersion) {
      viewerState.renderTask = null;
      viewerState.renderInProgress = false;
    }
  }
}

function scheduleRender(reason = "Atualizacao visual.") {
  viewerState.renderPending = true;

  if (viewerState.renderRequestId !== null) {
    return;
  }

  viewerState.renderRequestId = requestAnimationFrame(async () => {
    viewerState.renderRequestId = null;

    if (!viewerState.renderPending) {
      return;
    }

    viewerState.renderPending = false;
    log(`Executando renderizacao agendada: ${reason}`);

    try {
      await renderCurrentPage();
    } catch (error) {
      logError("Falha na renderizacao agendada.", error);
    }
  });
}

function cancelScheduledRender() {
  if (viewerState.renderRequestId === null) {
    if (viewerState.zoomRenderTimeoutId !== null) {
      clearTimeout(viewerState.zoomRenderTimeoutId);
      viewerState.zoomRenderTimeoutId = null;
      viewerState.renderPending = false;
      log("Renderizacao de zoom agendada cancelada.");
    }

    return;
  }

  cancelAnimationFrame(viewerState.renderRequestId);
  viewerState.renderRequestId = null;
  viewerState.renderPending = false;

  if (viewerState.zoomRenderTimeoutId !== null) {
    clearTimeout(viewerState.zoomRenderTimeoutId);
    viewerState.zoomRenderTimeoutId = null;
  }

  log("Renderizacao agendada cancelada.");
}

function scheduleZoomRender(reason = "Atualizacao de zoom.") {
  viewerState.renderPending = true;

  if (viewerState.zoomRenderTimeoutId !== null) {
    clearTimeout(viewerState.zoomRenderTimeoutId);
  }

  viewerState.zoomRenderTimeoutId = window.setTimeout(async () => {
    viewerState.zoomRenderTimeoutId = null;

    if (!viewerState.renderPending) {
      return;
    }

    viewerState.renderPending = false;

    log(`Executando renderizacao de zoom: ${reason}`);

    try {
      await renderCurrentPage();
    } catch (error) {
      logError("Falha na renderizacao de zoom.", error);
    }
  }, ZOOM_RENDER_DELAY);
}

function setZoom(
  newZoom,
  viewerX = ui.viewer.clientWidth / 2,
  viewerY = ui.viewer.clientHeight / 2,
) {
  const oldZoom = viewerState.zoom;
  const nextZoom = clamp(roundZoom(newZoom), MIN_ZOOM, MAX_ZOOM);

  if (nextZoom === oldZoom) {
    return;
  }

  const canvasPoint = viewerToCanvasCoordinates(viewerState, viewerX, viewerY);

  viewerState.zoom = nextZoom;
  viewerState.panX = viewerX - canvasPoint.x * viewerState.zoom;
  viewerState.panY = viewerY - canvasPoint.y * viewerState.zoom;

  updateZoomInterface();
  applyCanvasTransform();

  log("Zoom alterado", {
    anterior: `${Math.round(oldZoom * 100)}%`,
    atual: `${Math.round(nextZoom * 100)}%`,
  });

  scheduleZoomRender("Alteracao de zoom.");
}

function zoomIn(viewerX, viewerY) {
  setZoom(roundZoom(viewerState.zoom + ZOOM_STEP), viewerX, viewerY);
}

function zoomOut(viewerX, viewerY) {
  setZoom(roundZoom(viewerState.zoom - ZOOM_STEP), viewerX, viewerY);
}

async function resetView() {
  log("Resetando visualizacao.");
  cancelScheduledRender();
  cancelCurrentRender("Reset da visualizacao.");
  viewerState.zoom = INITIAL_ZOOM;
  updateZoomInterface();
  await renderCurrentPage();
  centerPage();
  updateZoomInterface();
  setStatus(`Pagina ${viewerState.currentPage} centralizada`);
}

async function goToPage(pageNumber) {
  if (!viewerState.pdfDocument) {
    return;
  }

  if (pageNumber < 1 || pageNumber > viewerState.totalPages) {
    logWarning(`Pagina invalida solicitada: ${pageNumber}`);
    return;
  }

  log(`Mudando da pagina ${viewerState.currentPage} para ${pageNumber}.`);
  cancelScheduledRender();
  cancelCurrentRender("Mudanca de pagina.");

  viewerState.currentPage = pageNumber;
  viewerState.panX = 0;
  viewerState.panY = 0;
  clearSelection("Selecao removida ao trocar de pagina.");

  await renderCurrentPage();
  centerPage();
  updatePageInterface();
}

function setInteractionMode(mode) {
  if (mode !== "pan" && mode !== "selection") {
    logWarning(`Modo de interacao invalido: ${mode}`);
    return;
  }

  viewerState.interactionMode = mode;
  if (mode === "selection") {
    setSelectionShapeMode("rectangle");
  }

  ui.panModeButton.classList.toggle("is-active", mode === "pan");
  ui.panModeButton.setAttribute("aria-pressed", String(mode === "pan"));
  ui.selectionModeButton.classList.toggle("is-active", mode === "selection");
  ui.selectionModeButton.setAttribute("aria-pressed", String(mode === "selection"));
  if (mode === "pan") {
    ui.polygonSelectionButton.classList.remove("is-active");
    ui.polygonSelectionButton.setAttribute("aria-pressed", "false");
  }
  ui.viewer.classList.toggle("is-selection-mode", mode === "selection");
  setStatus(mode === "selection" ? "Modo selecao ativo" : "Modo mover ativo");
  log("Modo de interacao alterado", { mode });
}

function setSelectionShapeMode(shapeMode) {
  if (shapeMode !== "rectangle" && shapeMode !== "polygon") {
    logWarning(`Forma de selecao invalida: ${shapeMode}`);
    return;
  }

  viewerState.selectionShapeMode = shapeMode;
  viewerState.isSelecting = false;
  viewerState.selectionStartPdf = null;
  viewerState.polygonPointsPdf = [];
  viewerState.polygonPreviewPdf = null;
  ui.viewer.classList.remove("is-selecting");
  ui.polygonSelectionButton.classList.toggle("is-active", shapeMode === "polygon");
  ui.polygonSelectionButton.setAttribute(
    "aria-pressed",
    String(shapeMode === "polygon"),
  );
  setStatus(
    shapeMode === "polygon"
      ? "Selecao por poligono ativa"
      : "Selecao por retangulo ativa",
  );
  log("Forma de selecao alterada", { shapeMode });
}

function updateSelectionOverlay() {
  ui.selectionOverlay.replaceChildren();

  const visibleSelections = projectState.selections.filter(
    (selection) => selection.page === viewerState.currentPage,
  );
  const activeSelection =
    projectState.activeSelection?.page === viewerState.currentPage
      ? projectState.activeSelection
      : null;
  const previewPoints =
    viewerState.selectionShapeMode === "polygon" &&
    viewerState.isSelecting &&
    viewerState.polygonPreviewPdf
      ? getPdfPointsAsViewerPoints([
          ...viewerState.polygonPointsPdf,
          viewerState.polygonPreviewPdf,
        ])
      : [];

  if (!visibleSelections.length && !activeSelection && !previewPoints.length) {
    hideSelectionOverlay();
    return;
  }

  showSelectionOverlay();

  for (const selection of visibleSelections) {
    appendSelectionOverlayPolygon(selection, "selection-overlay-shape");
  }

  if (activeSelection) {
    appendSelectionOverlayPolygon(
      activeSelection,
      "selection-overlay-shape selection-overlay-active",
    );
  }

  if (previewPoints.length) {
    const previewElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "polyline",
    );

    previewElement.setAttribute("class", "selection-overlay-preview");
    previewElement.setAttribute("points", pointsToSvgAttribute(previewPoints));
    ui.selectionOverlay.appendChild(previewElement);
  }
}

function appendSelectionOverlayPolygon(selection, className) {
  const shapeElement = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );

  shapeElement.setAttribute("class", className);
  shapeElement.setAttribute(
    "points",
    pointsToSvgAttribute(getSelectionViewerPoints(selection)),
  );
  ui.selectionOverlay.appendChild(shapeElement);
}

function showSelectionOverlay() {
  ui.selectionOverlay.removeAttribute("hidden");
}

function hideSelectionOverlay() {
  ui.selectionOverlay.setAttribute("hidden", "");
}

function getSelectionViewerPoints(selection) {
  const points = selection.points?.length
    ? selection.points
    : [
        { x: selection.x, y: selection.y },
        { x: selection.x + selection.width, y: selection.y },
        { x: selection.x + selection.width, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height },
      ];

  return getPdfPointsAsViewerPoints(points);
}

function getPdfPointsAsViewerPoints(points) {
  return points.map((point) =>
    pdfToViewerCoordinates(viewerState, point.x, point.y),
  );
}

function pointsToSvgAttribute(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function clearSelection(reason = "Selecao removida.") {
  viewerState.isSelecting = false;
  viewerState.selectionStartPdf = null;
  viewerState.polygonPointsPdf = [];
  viewerState.polygonPreviewPdf = null;
  projectState.activeSelection = null;
  projectState.lineHighlights = [];
  projectState.selectedPdfItems = [];
  projectState.selectedAnnotationId = null;
  clearLineHighlights();
  updateSelectionOverlay();
  updateSelectionPanel();
  renderAnnotations();
  setStatus(reason);
  log(reason);
}

function findSelectionAtPdfPoint(pdfPoint) {
  if (
    isPdfPointInsideSelection(
      pdfPoint,
      projectState.activeSelection,
      viewerState.currentPage,
    )
  ) {
    return projectState.activeSelection;
  }

  return [...projectState.selections]
    .reverse()
    .find((selection) =>
      isPdfPointInsideSelection(pdfPoint, selection, viewerState.currentPage),
    );
}

function deleteSelection(selection, reason = "Area selecionada excluida.") {
  if (!selection) {
    return;
  }

  const selectionSignature = getSelectionSignature(selection);

  projectState.selections = projectState.selections.filter(
    (existingSelection) =>
      getSelectionSignature(existingSelection) !== selectionSignature,
  );

  if (
    projectState.activeSelection &&
    getSelectionSignature(projectState.activeSelection) === selectionSignature
  ) {
    projectState.activeSelection = null;
  }

  clearSelection(reason);
}

function requestSelectionDeletion(selection) {
  if (!selection) {
    return;
  }

  const selectionLabel =
    selection.type === "polygon" ? "area em poligono" : "area retangular";

  openConfirmDialog({
    title: "Excluir area marcada?",
    message: `Deseja excluir esta ${selectionLabel}? Esta acao remove a marcacao da memoria do projeto.`,
    confirmLabel: "Excluir",
    onConfirm: () => deleteSelection(selection),
  });
}

function startSelection(event) {
  if (viewerState.selectionShapeMode === "polygon") {
    if (event.pointerType === "mouse" && event.button === 2) {
      undoLastPolygonSelectionPoint();
      return;
    }

    addPolygonSelectionPoint(event);
    return;
  }

  startRectangleSelection(event);
}

function startRectangleSelection(event) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const pdfPoint = viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y);

  if (!isPdfPointInsidePage(viewerState, pdfPoint)) {
    clearSelection("Clique fora da planta removeu a selecao.");
    return;
  }

  if (
    isPdfPointInsideSelection(
      pdfPoint,
      projectState.activeSelection,
      viewerState.currentPage,
    )
  ) {
    return;
  }

  viewerState.isSelecting = true;
  viewerState.selectionStartPdf = clampPdfPoint(viewerState, pdfPoint);
  projectState.lineHighlights = [];
  projectState.selectedPdfItems = [];
  projectState.activeSelection = normalizePdfSelection(
    viewerState.currentPage,
    viewerState.selectionStartPdf,
    viewerState.selectionStartPdf,
  );
  projectState.selectedAnnotationId = null;

  ui.viewer.classList.add("is-selecting");
  ui.viewer.setPointerCapture(event.pointerId);
  updateSelectionOverlay();
  clearLineHighlights();
  updateSelectionPanel();
  log("Selecao iniciada.", { page: viewerState.currentPage });
}

function addPolygonSelectionPoint(event) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  if (event.detail > 1) {
    return;
  }

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const pdfPoint = viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y);

  if (!isPdfPointInsidePage(viewerState, pdfPoint)) {
    clearSelection("Clique fora da planta removeu a selecao.");
    return;
  }

  if (
    !viewerState.isSelecting &&
    isPdfPointInsideSelection(
      pdfPoint,
      projectState.activeSelection,
      viewerState.currentPage,
    )
  ) {
    return;
  }

  const clampedPoint = clampPdfPoint(viewerState, pdfPoint);

  viewerState.isSelecting = true;
  viewerState.polygonPointsPdf = [...viewerState.polygonPointsPdf, clampedPoint];
  viewerState.polygonPreviewPdf = clampedPoint;
  projectState.lineHighlights = [];
  projectState.selectedPdfItems = [];
  projectState.selectedAnnotationId = null;
  projectState.activeSelection = createPdfPolygonSelection(
    viewerState.currentPage,
    viewerState.polygonPointsPdf,
  );

  ui.viewer.classList.add("is-selecting");
  updateSelectionOverlay();
  clearLineHighlights();
  updateSelectionPanel();
  log("Vertice de poligono adicionado.", {
    page: viewerState.currentPage,
    vertices: viewerState.polygonPointsPdf.length,
  });
}

function undoLastPolygonSelectionPoint() {
  if (
    viewerState.selectionShapeMode !== "polygon" ||
    !viewerState.isSelecting ||
    !viewerState.polygonPointsPdf.length
  ) {
    return;
  }

  viewerState.polygonPointsPdf = viewerState.polygonPointsPdf.slice(0, -1);
  viewerState.polygonPreviewPdf =
    viewerState.polygonPointsPdf[viewerState.polygonPointsPdf.length - 1] || null;

  if (!viewerState.polygonPointsPdf.length) {
    clearSelection("Ultimo vertice do poligono removido.");
    return;
  }

  projectState.activeSelection = createPdfPolygonSelection(
    viewerState.currentPage,
    viewerState.polygonPointsPdf,
  );

  projectState.lineHighlights = [];
  projectState.selectedPdfItems = [];
  clearLineHighlights();
  updateSelectionOverlay();
  updateSelectionPanel();
  setStatus("Ultima linha do poligono removida");
  log("Ultimo vertice do poligono removido.", {
    vertices: viewerState.polygonPointsPdf.length,
  });
}

function moveSelection(event) {
  if (!viewerState.isSelecting || !viewerState.selectionStartPdf) {
    movePolygonSelectionPreview(event);
    return;
  }

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const pdfPoint = clampPdfPoint(
    viewerState,
    viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y),
  );

  projectState.activeSelection = normalizePdfSelection(
    viewerState.currentPage,
    viewerState.selectionStartPdf,
    pdfPoint,
  );

  updateSelectionOverlay();
  clearLineHighlights();
}

function movePolygonSelectionPreview(event) {
  if (
    viewerState.selectionShapeMode !== "polygon" ||
    !viewerState.isSelecting ||
    !viewerState.polygonPointsPdf.length
  ) {
    return;
  }

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  viewerState.polygonPreviewPdf = clampPdfPoint(
    viewerState,
    viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y),
  );

  updateSelectionOverlay();
}

function endSelection(event) {
  if (viewerState.selectionShapeMode === "polygon") {
    return;
  }

  if (!viewerState.isSelecting) {
    return;
  }

  viewerState.isSelecting = false;
  viewerState.selectionStartPdf = null;
  ui.viewer.classList.remove("is-selecting");

  if (ui.viewer.hasPointerCapture(event.pointerId)) {
    ui.viewer.releasePointerCapture(event.pointerId);
  }

  const selection = projectState.activeSelection;

  if (!selection || selection.width < 2 || selection.height < 2) {
    clearSelection("Selecao muito pequena foi ignorada.");
    return;
  }

  finishSelection(selection);
}

function finishPolygonSelection() {
  if (
    viewerState.selectionShapeMode !== "polygon" ||
    !viewerState.isSelecting ||
    viewerState.polygonPointsPdf.length < 3
  ) {
    return;
  }

  const selection = createPdfPolygonSelection(
    viewerState.currentPage,
    viewerState.polygonPointsPdf,
  );

  viewerState.isSelecting = false;
  viewerState.polygonPointsPdf = [];
  viewerState.polygonPreviewPdf = null;
  ui.viewer.classList.remove("is-selecting");
  projectState.activeSelection = selection;

  if (selection.width < 2 || selection.height < 2) {
    clearSelection("Selecao muito pequena foi ignorada.");
    return;
  }

  finishSelection(selection);
}

function finishSelection(selection) {
  addPersistentSelection(selection);
  updateSelectionOverlay();
  projectState.selectedPdfItems = findPdfVectorItemsForSelection(
    getPdfVectorItemsForCurrentPage(),
    selection,
  );
  projectState.lineHighlights = projectState.selectedPdfItems.length
    ? projectState.selectedPdfItems
    : detectLineHighlightsForSelection(selection);
  renderLineHighlights();
  updateSelectionPanel();
  setStatus(
    projectState.lineHighlights.length
      ? "Area selecionada - linhas destacadas"
      : "Area selecionada",
  );
  log("Selecao finalizada.", {
    page: selection.page,
    tipo: selection.type || "rectangle",
    vertices: selection.points?.length || 4,
    x: Math.round(selection.x),
    y: Math.round(selection.y),
    width: Math.round(selection.width),
    height: Math.round(selection.height),
    itensPdfIdentificados: projectState.selectedPdfItems.length,
    destaques: projectState.lineHighlights.length,
  });
}

async function ensurePdfVectorItemsForPage(page, pageNumber) {
  if (viewerState.vectorItemsByPage.has(pageNumber)) {
    return;
  }

  try {
    const vectorItems = await extractPdfVectorItems(page, pageNumber, pdfjsLib);

    viewerState.vectorItemsByPage.set(pageNumber, vectorItems);

    log("Itens vetoriais do PDF extraidos.", {
      page: pageNumber,
      itens: vectorItems.length,
    });
  } catch (error) {
    viewerState.vectorItemsByPage.set(pageNumber, []);
    logWarning("Nao foi possivel extrair itens vetoriais do PDF.", error);
  }
}

function queuePdfVectorExtraction(page, pageNumber, renderVersion) {
  if (viewerState.vectorItemsByPage.has(pageNumber)) {
    return;
  }

  window.setTimeout(async () => {
    if (renderVersion !== viewerState.renderVersion) {
      return;
    }

    await ensurePdfVectorItemsForPage(page, pageNumber);

    if (
      renderVersion !== viewerState.renderVersion ||
      pageNumber !== viewerState.currentPage ||
      !projectState.activeSelection
    ) {
      return;
    }

    projectState.selectedPdfItems = findPdfVectorItemsForSelection(
      getPdfVectorItemsForCurrentPage(),
      projectState.activeSelection,
    );

    if (projectState.selectedPdfItems.length) {
      projectState.lineHighlights = projectState.selectedPdfItems;
      renderLineHighlights();
      updateSelectionPanel();
    }
  }, 0);
}

function getPdfVectorItemsForCurrentPage() {
  return viewerState.vectorItemsByPage.get(viewerState.currentPage) || [];
}

function detectLineHighlightsForSelection(selection) {
  return detectLineHighlightsFromCanvas({
    selection,
    pdfCanvas: ui.canvas,
    pdfCanvasContext: canvasContext,
    viewerState,
    onReadError: (error) => {
      logWarning("Nao foi possivel ler pixels da selecao para destacar linhas.", error);
    },
  });
}

function renderLineHighlights() {
  renderLineHighlightLayer({
    canvas: ui.lineHighlightCanvas,
    context: lineHighlightContext,
    highlights: projectState.lineHighlights,
    viewerElement: ui.viewer,
    viewerState,
  });
}

function clearLineHighlights() {
  clearLineHighlightsLayer({
    context: lineHighlightContext,
    viewerElement: ui.viewer,
  });
}

function updateSelectionPanel() {
  const selection = projectState.activeSelection;
  const selectedAnnotation = projectState.annotations.find(
    (annotation) => annotation.id === projectState.selectedAnnotationId,
  );

  renderSelectionPanel({
    panelElement: ui.selectionPanel,
    contentElement: ui.selectionPanelContent,
    selection,
    selectedAnnotation,
    ifcModel: projectState.ifcModel,
    pdfItems: projectState.selectedPdfItems,
    pageBounds: {
      page: viewerState.currentPage,
      width: viewerState.pageWidth,
      height: viewerState.pageHeight,
    },
    onSaveAnnotation: saveAnnotationFromPanel,
    onDeleteAnnotation: deleteSelectedAnnotation,
  });
}

function saveAnnotationFromPanel() {
  const input = document.getElementById("annotationTextInput");
  const text = input?.value?.trim() || "";
  const selectedAnnotation = projectState.annotations.find(
    (annotation) => annotation.id === projectState.selectedAnnotationId,
  );

  if (!projectState.activeSelection || !text) {
    setStatus("Selecione uma area e informe um texto.");
    return;
  }

  const textX = selectedAnnotation?.textX ?? projectState.activeSelection.x;
  const textY =
    selectedAnnotation?.textY ??
    projectState.activeSelection.y + projectState.activeSelection.height;
  const maxTextWidth = Math.max(
    MIN_TEXT_WIDTH,
    projectState.activeSelection.x + projectState.activeSelection.width - textX,
  );
  const maxTextHeight = Math.max(
    MIN_TEXT_HEIGHT,
    textY - projectState.activeSelection.y,
  );
  const textWidth = Math.max(
    MIN_TEXT_WIDTH,
    Math.min(
      maxTextWidth,
      getNumericInputValue(
        "annotationTextWidthInput",
        projectState.activeSelection.width,
      ),
    ),
  );
  const textHeight = Math.max(
    MIN_TEXT_HEIGHT,
    Math.min(
      maxTextHeight,
      getNumericInputValue(
        "annotationTextHeightInput",
        projectState.activeSelection.height,
      ),
    ),
  );
  const textRotation = normalizeDegrees(
    getNumericInputValue("annotationTextRotationInput", 0),
  );

  if (projectState.selectedAnnotationId) {
    projectState.annotations = updateAnnotation(
      projectState.annotations,
      projectState.selectedAnnotationId,
      { text, textWidth, textHeight, textRotation },
    );
    setStatus("Anotacao atualizada");
  } else {
    const annotation = {
      ...createAnnotation(projectState.activeSelection, text),
      textWidth,
      textHeight,
      textRotation,
    };
    projectState.annotations = [...projectState.annotations, annotation];
    projectState.selectedAnnotationId = annotation.id;
    setStatus("Anotacao inserida");
  }

  updateSelectionPanel();
  renderAnnotations();
}

function deleteSelectedAnnotation() {
  if (!projectState.selectedAnnotationId) {
    return;
  }

  projectState.annotations = deleteAnnotation(
    projectState.annotations,
    projectState.selectedAnnotationId,
  );
  projectState.selectedAnnotationId = null;
  setStatus("Anotacao apagada");
  updateSelectionPanel();
  renderAnnotations();
}

function renderAnnotations() {
  renderAnnotationLayer({
    layerElement: ui.annotationLayer,
    annotations: projectState.annotations,
    currentPage: viewerState.currentPage,
    selectedAnnotationId: projectState.selectedAnnotationId,
    viewerState,
    onPointerDown: startAnnotationDrag,
  });
}

function startAnnotationDrag(event) {
  const annotationId = event.currentTarget.dataset.annotationId;
  const annotation = projectState.annotations.find((item) => item.id === annotationId);

  if (!annotation) {
    return;
  }

  event.stopPropagation();
  event.preventDefault();
  projectState.selectedAnnotationId = annotation.id;
  projectState.activeSelection = {
    type: annotation.type || "rectangle",
    page: annotation.page,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
    points: annotation.points?.map((point) => ({ x: point.x, y: point.y })) || null,
  };

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const action = event.target.dataset.annotationAction || "move";
  const textWidth = annotation.textWidth ?? annotation.width;
  const textHeight = annotation.textHeight ?? annotation.height;
  const textRotation = annotation.textRotation || 0;
  const textTopLeft = pdfToViewerCoordinates(
    viewerState,
    annotation.textX ?? annotation.x,
    annotation.textY ?? annotation.y + annotation.height,
  );

  annotationDrag = {
    mode: action,
    pointerId: event.pointerId,
    annotationId,
    startPdf: viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y),
    startViewer: viewerPoint,
    textStart: {
      x: annotation.textX ?? annotation.x,
      y: annotation.textY ?? annotation.y + annotation.height,
    },
    sizeStart: {
      width: textWidth,
      height: textHeight,
    },
    rotationStart: textRotation,
    centerViewer: {
      x: textTopLeft.x + (textWidth * viewerState.zoom) / 2,
      y: textTopLeft.y + (textHeight * viewerState.zoom) / 2,
    },
  };

  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add("is-selected");
  updateSelectionOverlay();
  updateSelectionPanel();
}

function moveAnnotation(event) {
  if (!annotationDrag || event.pointerId !== annotationDrag.pointerId) {
    return;
  }

  const annotation = projectState.annotations.find(
    (item) => item.id === annotationDrag.annotationId,
  );

  if (!annotation) {
    return;
  }

  if (annotationDrag.mode === "resize") {
    resizeAnnotationText(event, annotation);
    return;
  }

  if (annotationDrag.mode === "rotate") {
    rotateAnnotationText(event, annotation);
    return;
  }

  moveAnnotationText(event, annotation);
}

function moveAnnotationText(event, annotation) {
  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const currentPdf = viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y);
  const deltaX = currentPdf.x - annotationDrag.startPdf.x;
  const deltaY = currentPdf.y - annotationDrag.startPdf.y;
  const textWidth = annotation.textWidth ?? annotation.width;
  const textHeight = annotation.textHeight ?? annotation.height;

  projectState.annotations = updateAnnotation(
    projectState.annotations,
    annotationDrag.annotationId,
    {
      textX: clamp(
        annotationDrag.textStart.x + deltaX,
        annotation.x,
        annotation.x + Math.max(annotation.width - textWidth, 0),
      ),
      textY: clamp(
        annotationDrag.textStart.y + deltaY,
        annotation.y + textHeight,
        annotation.y + annotation.height,
      ),
    },
  );

  const updatedAnnotation = projectState.annotations.find(
    (item) => item.id === annotationDrag.annotationId,
  );

  updateAnnotationElementPosition(updatedAnnotation);
}

function resizeAnnotationText(event, annotation) {
  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const deltaX = viewerPoint.x - annotationDrag.startViewer.x;
  const deltaY = viewerPoint.y - annotationDrag.startViewer.y;
  const localDelta = rotateViewerDelta(deltaX, deltaY, annotationDrag.rotationStart);
  const textX = annotation.textX ?? annotation.x;
  const textY = annotation.textY ?? annotation.y + annotation.height;
  const maxWidth = Math.max(
    annotation.x + annotation.width - textX,
    MIN_TEXT_WIDTH,
  );
  const maxHeight = Math.max(textY - annotation.y, MIN_TEXT_HEIGHT);
  const textWidth = clamp(
    annotationDrag.sizeStart.width + localDelta.x / viewerState.zoom,
    MIN_TEXT_WIDTH,
    maxWidth,
  );
  const textHeight = clamp(
    annotationDrag.sizeStart.height + localDelta.y / viewerState.zoom,
    MIN_TEXT_HEIGHT,
    maxHeight,
  );

  projectState.annotations = updateAnnotation(
    projectState.annotations,
    annotationDrag.annotationId,
    { textWidth, textHeight },
  );

  updateAnnotationElementPosition(
    projectState.annotations.find((item) => item.id === annotationDrag.annotationId),
  );
}

function rotateAnnotationText(event, annotation) {
  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const angle =
    (Math.atan2(
      viewerPoint.y - annotationDrag.centerViewer.y,
      viewerPoint.x - annotationDrag.centerViewer.x,
    ) *
      180) /
    Math.PI;
  const textRotation = normalizeDegrees(angle + 90);

  projectState.annotations = updateAnnotation(
    projectState.annotations,
    annotation.id,
    { textRotation },
  );

  updateAnnotationElementPosition(
    projectState.annotations.find((item) => item.id === annotation.id),
  );
}

function endAnnotationDrag(event) {
  if (!annotationDrag || event.pointerId !== annotationDrag.pointerId) {
    return;
  }

  const statusByMode = {
    move: "Texto movido",
    resize: "Area do texto ajustada",
    rotate: "Texto rotacionado",
  };
  const status = statusByMode[annotationDrag.mode] || "Anotacao atualizada";

  annotationDrag = null;
  updateSelectionPanel();
  renderAnnotations();
  setStatus(status);
}

function updateAnnotationElementPosition(annotation) {
  if (!annotation) {
    return;
  }

  const element = ui.annotationLayer.querySelector(
    `[data-annotation-id="${annotation.id}"]`,
  );

  if (!element) {
    return;
  }

  const textTopLeft = pdfToViewerCoordinates(
    viewerState,
    annotation.textX ?? annotation.x,
    annotation.textY ?? annotation.y + annotation.height,
  );

  element.style.left = `${textTopLeft.x}px`;
  element.style.top = `${textTopLeft.y}px`;
  const renderedWidth = Math.max(
    (annotation.textWidth ?? annotation.width) * viewerState.zoom,
    24,
  );
  const renderedHeight = Math.max(
    (annotation.textHeight ?? annotation.height) * viewerState.zoom,
    18,
  );

  element.style.width = `${renderedWidth}px`;
  element.style.height = `${renderedHeight}px`;
  element.style.transform = `rotate(${annotation.textRotation || 0}deg)`;
  element.querySelector(".annotation-text").style.fontSize = `${calculateResponsiveTextSize(
    annotation.text,
    renderedWidth,
    renderedHeight,
  )}px`;
}

function startPan(event) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  viewerState.isPanning = true;
  viewerState.pointerStartX = event.clientX;
  viewerState.pointerStartY = event.clientY;
  viewerState.panStartX = viewerState.panX;
  viewerState.panStartY = viewerState.panY;
  ui.viewer.classList.add("is-panning");
  ui.viewer.setPointerCapture(event.pointerId);
  log("Pan iniciado.");
}

function movePan(event) {
  if (!viewerState.isPanning) {
    return;
  }

  viewerState.panX = viewerState.panStartX + event.clientX - viewerState.pointerStartX;
  viewerState.panY = viewerState.panStartY + event.clientY - viewerState.pointerStartY;
  applyCanvasTransform();
}

function endPan(event) {
  if (!viewerState.isPanning) {
    return;
  }

  viewerState.isPanning = false;
  ui.viewer.classList.remove("is-panning");

  if (ui.viewer.hasPointerCapture(event.pointerId)) {
    ui.viewer.releasePointerCapture(event.pointerId);
  }

  log("Pan finalizado", {
    panX: Math.round(viewerState.panX),
    panY: Math.round(viewerState.panY),
  });
}

function handleWheel(event) {
  event.preventDefault();

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);

  if (event.ctrlKey) {
    const direction = event.deltaY < 0 ? 1 : -1;
    setZoom(
      roundZoom(viewerState.zoom + direction * ZOOM_STEP),
      viewerPoint.x,
      viewerPoint.y,
    );
    return;
  }

  viewerState.panX -= event.deltaX;
  viewerState.panY -= event.deltaY;
  applyCanvasTransform();

  const now = Date.now();

  if (now - viewerState.lastWheelLogTime > 500) {
    log("Pan por roda do mouse", {
      panX: Math.round(viewerState.panX),
      panY: Math.round(viewerState.panY),
    });
    viewerState.lastWheelLogTime = now;
  }
}

function handleDoubleClick(event) {
  if (viewerState.interactionMode === "selection") {
    event.preventDefault();
    finishPolygonSelection();
    return;
  }

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  log("Duplo clique detectado. Aplicando zoom.");
  zoomIn(viewerPoint.x, viewerPoint.y);
}

function handlePointerDown(event) {
  if (viewerState.interactionMode === "selection") {
    startSelection(event);
    return;
  }

  startPan(event);
}

function handlePointerMove(event) {
  if (annotationDrag) {
    moveAnnotation(event);
    return;
  }

  if (viewerState.interactionMode === "selection") {
    moveSelection(event);
    return;
  }

  movePan(event);
}

function handlePointerEnd(event) {
  if (annotationDrag) {
    endAnnotationDrag(event);
    return;
  }

  if (viewerState.interactionMode === "selection") {
    endSelection(event);
    return;
  }

  endPan(event);
}

function openConfirmDialog({ title, message, confirmLabel, onConfirm }) {
  confirmDialogAction = onConfirm;
  ui.confirmDialogTitle.textContent = title;
  ui.confirmDialogMessage.textContent = message;
  ui.confirmAcceptButton.textContent = confirmLabel;
  ui.confirmDialog.removeAttribute("hidden");
  ui.confirmCancelButton.focus();
}

function closeConfirmDialog() {
  confirmDialogAction = null;
  ui.confirmDialog.setAttribute("hidden", "");
}

function acceptConfirmDialog() {
  const action = confirmDialogAction;

  closeConfirmDialog();

  if (action) {
    action();
  }
}

function requestActiveSelectionDeletion() {
  if (!projectState.activeSelection) {
    clearSelection();
    return;
  }

  requestSelectionDeletion(projectState.activeSelection);
}

function handleContextMenu(event) {
  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const pdfPoint = viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y);
  const selection = findSelectionAtPdfPoint(pdfPoint);

  if (
    viewerState.interactionMode === "selection" &&
    viewerState.selectionShapeMode === "polygon" &&
    viewerState.isSelecting
  ) {
    event.preventDefault();
    return;
  }

  if (selection) {
    event.preventDefault();
    projectState.activeSelection = cloneSelection(selection);
    updateSelectionOverlay();
    updateSelectionPanel();
    requestSelectionDeletion(selection);
    return;
  }

  if (
    viewerState.interactionMode === "selection" &&
    viewerState.selectionShapeMode === "polygon"
  ) {
    event.preventDefault();
  }
}

function saveCurrentProject() {
  saveProjectState({
    currentPage: viewerState.currentPage,
    zoom: viewerState.zoom,
    panX: viewerState.panX,
    panY: viewerState.panY,
    activeSelection: projectState.activeSelection,
    selections: projectState.selections,
    lineHighlights: projectState.lineHighlights,
    selectedPdfItems: projectState.selectedPdfItems,
    annotations: projectState.annotations,
    selectedAnnotationId: projectState.selectedAnnotationId,
  });

  setStatus("Projeto salvo localmente");
  log("Projeto salvo localmente.");
}

async function loadSavedProject() {
  const savedState = loadProjectState();

  if (!savedState) {
    setStatus("Nenhum projeto salvo encontrado");
    return;
  }

  viewerState.currentPage = clamp(
    savedState.currentPage || 1,
    1,
    viewerState.totalPages || 1,
  );
  viewerState.zoom = savedState.zoom || INITIAL_ZOOM;
  viewerState.panX = savedState.panX || 0;
  viewerState.panY = savedState.panY || 0;
  projectState.activeSelection = savedState.activeSelection || null;
  projectState.selections = savedState.selections || [];
  projectState.lineHighlights = savedState.lineHighlights || [];
  projectState.selectedPdfItems = savedState.selectedPdfItems || [];
  projectState.annotations = savedState.annotations || [];
  projectState.selectedAnnotationId = savedState.selectedAnnotationId || null;

  await renderCurrentPage();
  updateZoomInterface();
  updatePageInterface();
  applyCanvasTransform();
  updateSelectionPanel();
  setStatus("Projeto local restaurado");
  log("Projeto local restaurado.");
}

function clearLocalProject() {
  clearProjectState();
  projectState.annotations = [];
  projectState.selections = [];
  projectState.lineHighlights = [];
  projectState.selectedPdfItems = [];
  clearSelection("Projeto local limpo.");
}

function requestClearLocalProject() {
  openConfirmDialog({
    title: "Limpar projeto local?",
    message:
      "Deseja limpar selecoes, anotacoes e dados salvos localmente neste navegador?",
    confirmLabel: "Limpar",
    onConfirm: clearLocalProject,
  });
}

async function loadPdf() {
  try {
    log(`Iniciando carregamento do PDF: ${PDF_FILE}`);
    setStatus("Carregando documento...");

    const loadingTask = pdfjsLib.getDocument({ url: PDF_FILE });

    loadingTask.onProgress = (progress) => {
      if (progress.total) {
        const percentage = Math.round((progress.loaded / progress.total) * 100);
        setStatus(`Carregando PDF... ${percentage}%`);
      }
    };

    viewerState.pdfDocument = await loadingTask.promise;
    viewerState.totalPages = viewerState.pdfDocument.numPages;
    viewerState.currentPage = 1;

    log("PDF carregado com sucesso.", {
      arquivo: PDF_FILE,
      paginas: viewerState.totalPages,
    });

    updatePageInterface();
    ui.loading.hidden = true;
    ui.error.hidden = true;
    ui.viewer.hidden = false;

    await renderCurrentPage();
    centerPage();
    updateZoomInterface();
    setStatus(`PDF carregado - ${viewerState.totalPages} pagina(s)`);
    log("Visualizador inicializado com sucesso.");
  } catch (error) {
    logError("Erro ao carregar PDF.", error);
    ui.loading.hidden = true;
    ui.viewer.hidden = true;
    ui.error.hidden = false;
    ui.errorMessage.textContent =
      error?.message || "Ocorreu um erro desconhecido ao carregar o PDF.";
    setStatus("Erro ao carregar PDF");
  }
}

async function loadIfc() {
  try {
    projectState.ifcModel = await loadIfcModel();

    log("IFC carregado com sucesso.", {
      arquivo: projectState.ifcModel.file,
      schema: projectState.ifcModel.schema,
      entidades: projectState.ifcModel.products.length,
      unidadeComprimento: projectState.ifcModel.units.length,
      entidadesComGeometria: projectState.ifcModel.products.filter(
        (product) => product.bounds,
      ).length,
    });

    updateSelectionPanel();
    setStatus(`IFC carregado - ${projectState.ifcModel.products.length} entidades`);
  } catch (error) {
    logError("Erro ao carregar IFC.", error);
    setStatus("Erro ao carregar IFC");
  }
}

function bindEvents() {
  ui.zoomInButton.addEventListener("click", () => zoomIn());
  ui.zoomOutButton.addEventListener("click", () => zoomOut());
  ui.resetViewButton.addEventListener("click", () => resetView());
  ui.previousPageButton.addEventListener("click", () =>
    goToPage(viewerState.currentPage - 1),
  );
  ui.nextPageButton.addEventListener("click", () =>
    goToPage(viewerState.currentPage + 1),
  );
  ui.panModeButton.addEventListener("click", () => setInteractionMode("pan"));
  ui.selectionModeButton.addEventListener("click", () =>
    setInteractionMode("selection"),
  );
  ui.polygonSelectionButton.addEventListener("click", () => {
    setInteractionMode("selection");
    setSelectionShapeMode("polygon");
  });
  ui.saveProjectButton.addEventListener("click", saveCurrentProject);
  ui.loadProjectButton.addEventListener("click", loadSavedProject);
  ui.clearProjectButton.addEventListener("click", requestClearLocalProject);
  ui.clearSelectionButton.addEventListener("click", requestActiveSelectionDeletion);
  ui.confirmCancelButton.addEventListener("click", closeConfirmDialog);
  ui.confirmAcceptButton.addEventListener("click", acceptConfirmDialog);
  ui.confirmDialog.addEventListener("pointerdown", (event) => {
    if (event.target === ui.confirmDialog) {
      closeConfirmDialog();
    }
  });
  ui.viewer.addEventListener("pointerdown", handlePointerDown);
  ui.viewer.addEventListener("pointermove", handlePointerMove);
  ui.viewer.addEventListener("pointerup", handlePointerEnd);
  ui.viewer.addEventListener("pointercancel", handlePointerEnd);
  ui.viewer.addEventListener("wheel", handleWheel, { passive: false });
  ui.viewer.addEventListener("dblclick", handleDoubleClick);
  ui.viewer.addEventListener("contextmenu", handleContextMenu);

  window.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomIn();
      return;
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomOut();
      return;
    }

    if (event.key === "0") {
      event.preventDefault();
      resetView();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (!ui.confirmDialog.hidden) {
        closeConfirmDialog();
        return;
      }
      clearSelection();
      return;
    }

    if (event.key === "Enter" && viewerState.interactionMode === "selection") {
      event.preventDefault();
      finishPolygonSelection();
    }
  });

  window.addEventListener("resize", () => {
    if (!viewerState.pdfDocument) {
      return;
    }

    centerPage();
    log("Visualizador redimensionado.");
  });
}

async function initialize() {
  log("========================================");
  log("Iniciando Editor de Planta Baixa...");
  log("========================================");
  log("Configuracoes", {
    pdf: PDF_FILE,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomStep: ZOOM_STEP,
    initialZoom: INITIAL_ZOOM,
    renderScheduler: RENDER_SCHEDULER,
  });

  updateZoomInterface();
  updatePageInterface();
  setInteractionMode("pan");
  bindEvents();

  await loadPdf();
  await loadIfc();
}

initialize();
