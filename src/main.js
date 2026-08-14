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
  panX: 0,
  panY: 0,
  isPanning: false,
  interactionMode: "pan",
  pointerStartX: 0,
  pointerStartY: 0,
  panStartX: 0,
  panStartY: 0,
  isSelecting: false,
  selectionStartPdf: null,
  renderTask: null,
  renderRequestId: null,
  renderVersion: 0,
  renderInProgress: false,
  renderPending: false,
  lastWheelLogTime: 0,
  vectorItemsByPage: new Map(),
};

const projectState = {
  activeSelection: null,
  lineHighlights: [],
  selectedPdfItems: [],
  annotations: [],
  selectedAnnotationId: null,
  ifcModel: null,
};

let annotationDrag = null;

function setStatus(message) {
  ui.statusMessage.textContent = message;
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
  ui.canvasContainer.style.transform = `translate3d(${viewerState.panX}px, ${viewerState.panY}px, 0)`;
  renderLineHighlights();
  updateSelectionOverlay();
  renderAnnotations();
}

function centerPage() {
  const center = getViewerCenter();

  viewerState.panX = center.x - viewerState.renderedWidth / 2;
  viewerState.panY = center.y - viewerState.renderedHeight / 2;

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

    await ensurePdfVectorItemsForPage(page, viewerState.currentPage);

    if (renderVersion !== viewerState.renderVersion) {
      logWarning(
        "Renderizacao ignorada apos extracao vetorial por existir uma versao mais recente.",
      );
      return;
    }

    const viewport = page.getViewport({ scale: viewerState.zoom });
    const outputScale = window.devicePixelRatio || 1;

    viewerState.pageWidth = page.view[2] - page.view[0];
    viewerState.pageHeight = page.view[3] - page.view[1];
    viewerState.renderedWidth = viewport.width;
    viewerState.renderedHeight = viewport.height;

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
    return;
  }

  cancelAnimationFrame(viewerState.renderRequestId);
  viewerState.renderRequestId = null;
  viewerState.renderPending = false;
  log("Renderizacao agendada cancelada.");
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

  scheduleRender("Alteracao de zoom.");
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
  ui.panModeButton.classList.toggle("is-active", mode === "pan");
  ui.panModeButton.setAttribute("aria-pressed", String(mode === "pan"));
  ui.selectionModeButton.classList.toggle("is-active", mode === "selection");
  ui.selectionModeButton.setAttribute("aria-pressed", String(mode === "selection"));
  ui.viewer.classList.toggle("is-selection-mode", mode === "selection");
  setStatus(mode === "selection" ? "Modo selecao ativo" : "Modo mover ativo");
  log("Modo de interacao alterado", { mode });
}

function updateSelectionOverlay() {
  const selection = projectState.activeSelection;

  if (!selection || selection.page !== viewerState.currentPage) {
    ui.selectionOverlay.hidden = true;
    return;
  }

  const topLeft = pdfToViewerCoordinates(
    viewerState,
    selection.x,
    selection.y + selection.height,
  );
  const bottomRight = pdfToViewerCoordinates(
    viewerState,
    selection.x + selection.width,
    selection.y,
  );

  ui.selectionOverlay.hidden = false;
  ui.selectionOverlay.style.left = `${topLeft.x}px`;
  ui.selectionOverlay.style.top = `${topLeft.y}px`;
  ui.selectionOverlay.style.width = `${bottomRight.x - topLeft.x}px`;
  ui.selectionOverlay.style.height = `${bottomRight.y - topLeft.y}px`;
}

function clearSelection(reason = "Selecao removida.") {
  viewerState.isSelecting = false;
  viewerState.selectionStartPdf = null;
  projectState.activeSelection = null;
  projectState.lineHighlights = [];
  projectState.selectedPdfItems = [];
  projectState.selectedAnnotationId = null;
  ui.selectionOverlay.hidden = true;
  clearLineHighlights();
  updateSelectionPanel();
  renderAnnotations();
  setStatus(reason);
  log(reason);
}

function startSelection(event) {
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
  projectState.activeSelection = {
    page: viewerState.currentPage,
    x: viewerState.selectionStartPdf.x,
    y: viewerState.selectionStartPdf.y,
    width: 0,
    height: 0,
  };
  projectState.selectedAnnotationId = null;

  ui.viewer.classList.add("is-selecting");
  ui.viewer.setPointerCapture(event.pointerId);
  updateSelectionOverlay();
  clearLineHighlights();
  updateSelectionPanel();
  log("Selecao iniciada.", { page: viewerState.currentPage });
}

function moveSelection(event) {
  if (!viewerState.isSelecting || !viewerState.selectionStartPdf) {
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

function endSelection(event) {
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

  if (!projectState.activeSelection || !text) {
    setStatus("Selecione uma area e informe um texto.");
    return;
  }

  if (projectState.selectedAnnotationId) {
    projectState.annotations = updateAnnotation(
      projectState.annotations,
      projectState.selectedAnnotationId,
      { text },
    );
    setStatus("Anotacao atualizada");
  } else {
    const annotation = createAnnotation(projectState.activeSelection, text);
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
  projectState.selectedAnnotationId = annotation.id;
  projectState.activeSelection = {
    page: annotation.page,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
  };

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);

  annotationDrag = {
    pointerId: event.pointerId,
    annotationId,
    startPdf: viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y),
    annotationStart: { x: annotation.x, y: annotation.y },
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

  const viewerPoint = getViewerCoordinatesFromEvent(ui.viewer, event);
  const currentPdf = viewerToPdfCoordinates(viewerState, viewerPoint.x, viewerPoint.y);
  const deltaX = currentPdf.x - annotationDrag.startPdf.x;
  const deltaY = currentPdf.y - annotationDrag.startPdf.y;

  projectState.annotations = updateAnnotation(
    projectState.annotations,
    annotationDrag.annotationId,
    {
      x: annotationDrag.annotationStart.x + deltaX,
      y: annotationDrag.annotationStart.y + deltaY,
    },
  );

  const annotation = projectState.annotations.find(
    (item) => item.id === annotationDrag.annotationId,
  );

  projectState.activeSelection = {
    page: annotation.page,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
  };

  updateSelectionOverlay();
  updateAnnotationElementPosition(annotation);
}

function endAnnotationDrag(event) {
  if (!annotationDrag || event.pointerId !== annotationDrag.pointerId) {
    return;
  }

  annotationDrag = null;
  updateSelectionPanel();
  renderAnnotations();
  setStatus("Anotacao movida");
}

function updateAnnotationElementPosition(annotation) {
  const element = ui.annotationLayer.querySelector(
    `[data-annotation-id="${annotation.id}"]`,
  );

  if (!element) {
    return;
  }

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

  element.style.left = `${topLeft.x}px`;
  element.style.top = `${topLeft.y}px`;
  element.style.width = `${bottomRight.x - topLeft.x}px`;
  element.style.minHeight = `${Math.max(bottomRight.y - topLeft.y, 30)}px`;
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

function saveCurrentProject() {
  saveProjectState({
    currentPage: viewerState.currentPage,
    zoom: viewerState.zoom,
    panX: viewerState.panX,
    panY: viewerState.panY,
    activeSelection: projectState.activeSelection,
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
  projectState.lineHighlights = [];
  projectState.selectedPdfItems = [];
  clearSelection("Projeto local limpo.");
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
  ui.saveProjectButton.addEventListener("click", saveCurrentProject);
  ui.loadProjectButton.addEventListener("click", loadSavedProject);
  ui.clearProjectButton.addEventListener("click", clearLocalProject);
  ui.clearSelectionButton.addEventListener("click", () => clearSelection());
  ui.viewer.addEventListener("pointerdown", handlePointerDown);
  ui.viewer.addEventListener("pointermove", handlePointerMove);
  ui.viewer.addEventListener("pointerup", handlePointerEnd);
  ui.viewer.addEventListener("pointercancel", handlePointerEnd);
  ui.viewer.addEventListener("wheel", handleWheel, { passive: false });
  ui.viewer.addEventListener("dblclick", handleDoubleClick);

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
      clearSelection();
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
