import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import "./style.css";

/*
|--------------------------------------------------------------------------
| Configurações
|--------------------------------------------------------------------------
*/

const PDF_FILE = "/assets/pdf/layout/planta-layout.pdf";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

const ZOOM_STEP = 0.1;

const INITIAL_ZOOM = 1;

/*
|--------------------------------------------------------------------------
| Configuração de renderização
|--------------------------------------------------------------------------
*/

const RENDER_SCHEDULER = "requestAnimationFrame";

/*
|--------------------------------------------------------------------------
| Configuração do PDF.js
|--------------------------------------------------------------------------
*/

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/*
|--------------------------------------------------------------------------
| Logs
|--------------------------------------------------------------------------
*/

const LOG_PREFIX = "[Editor Planta Baixa]";

function log(message, data = null) {
  if (data !== null) {
    console.log(`${LOG_PREFIX} ${message}`, data);

    return;
  }

  console.log(`${LOG_PREFIX} ${message}`);
}

function logWarning(message, data = null) {
  if (data !== null) {
    console.warn(`${LOG_PREFIX} ${message}`, data);

    return;
  }

  console.warn(`${LOG_PREFIX} ${message}`);
}

function logError(message, error = null) {
  if (error !== null) {
    console.error(`${LOG_PREFIX} ${message}`, error);

    return;
  }

  console.error(`${LOG_PREFIX} ${message}`);
}

/*
|--------------------------------------------------------------------------
| Elementos da interface
|--------------------------------------------------------------------------
*/

const loadingElement = document.getElementById("loading");

const errorElement = document.getElementById("error");

const errorMessageElement = document.getElementById("errorMessage");

const viewerElement = document.getElementById("viewer");

const canvasContainerElement = document.getElementById("canvasContainer");

const canvasElement = document.getElementById("pdfCanvas");

const currentPageElement = document.getElementById("currentPage");

const totalPagesElement = document.getElementById("totalPages");

const zoomValueElement = document.getElementById("zoomValue");

const statusMessageElement = document.getElementById("statusMessage");

const previousPageButton = document.getElementById("previousPageButton");

const nextPageButton = document.getElementById("nextPageButton");

const zoomOutButton = document.getElementById("zoomOutButton");

const zoomInButton = document.getElementById("zoomInButton");

const resetViewButton = document.getElementById("resetViewButton");

const panModeButton = document.getElementById("panModeButton");

const selectionModeButton = document.getElementById("selectionModeButton");

const selectionOverlayElement = document.getElementById("selectionOverlay");

const selectionPanelElement = document.getElementById("selectionPanel");

const selectionPanelContentElement = document.getElementById(
  "selectionPanelContent",
);

const clearSelectionButton = document.getElementById("clearSelectionButton");

/*
|--------------------------------------------------------------------------
| Validação dos elementos
|--------------------------------------------------------------------------
*/

const requiredElements = {
  loadingElement,
  errorElement,
  errorMessageElement,
  viewerElement,
  canvasContainerElement,
  canvasElement,
  currentPageElement,
  totalPagesElement,
  zoomValueElement,
  statusMessageElement,
  previousPageButton,
  nextPageButton,
  zoomOutButton,
  zoomInButton,
  resetViewButton,
  panModeButton,
  selectionModeButton,
  selectionOverlayElement,
  selectionPanelElement,
  selectionPanelContentElement,
  clearSelectionButton,
};

for (const [name, element] of Object.entries(requiredElements)) {
  if (!element) {
    logError(`Elemento obrigatório não encontrado: ${name}`);
  }
}

/*
|--------------------------------------------------------------------------
| Contexto do Canvas
|--------------------------------------------------------------------------
*/

const canvasContext = canvasElement.getContext("2d", {
  alpha: false,
});

/*
|--------------------------------------------------------------------------
| Estado do visualizador
|--------------------------------------------------------------------------
*/

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

  activeSelection: null,

  /*
   * Controle da renderização.
   */
  renderTask: null,

  renderRequestId: null,

  renderVersion: 0,

  renderInProgress: false,

  /*
   * Indica que existe uma renderização
   * pendente com o estado mais recente.
   */
  renderPending: false,

  /*
   * Controle dos logs de wheel.
   */
  lastWheelLogTime: 0,

  /*
   * Controle para evitar múltiplos
   * eventos de zoom simultâneos.
   */
  zoomOperationId: 0,
};

/*
|--------------------------------------------------------------------------
| Utilidades
|--------------------------------------------------------------------------
*/

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundZoom(value) {
  return Math.round(value * 10) / 10;
}

function setStatus(message) {
  statusMessageElement.textContent = message;
}

function updateZoomInterface() {
  const percentage = Math.round(viewerState.zoom * 100);

  zoomValueElement.textContent = `${percentage}%`;

  zoomOutButton.disabled = viewerState.zoom <= MIN_ZOOM;

  zoomInButton.disabled = viewerState.zoom >= MAX_ZOOM;
}

function updatePageInterface() {
  currentPageElement.textContent = viewerState.currentPage;

  totalPagesElement.textContent = viewerState.totalPages;

  previousPageButton.disabled = viewerState.currentPage <= 1;

  nextPageButton.disabled = viewerState.currentPage >= viewerState.totalPages;
}

function applyCanvasTransform() {
  canvasContainerElement.style.transform = `translate3d(${viewerState.panX}px, ${viewerState.panY}px, 0)`;

  updateSelectionOverlay();
}

function getViewerCenter() {
  return {
    x: viewerElement.clientWidth / 2,

    y: viewerElement.clientHeight / 2,
  };
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

/*
|--------------------------------------------------------------------------
| Sistema de coordenadas
|--------------------------------------------------------------------------
|
| Estas funções serão utilizadas na Fase 2.
|--------------------------------------------------------------------------
*/

function viewerToCanvasCoordinates(viewerX, viewerY) {
  return {
    x: (viewerX - viewerState.panX) / viewerState.zoom,

    y: (viewerY - viewerState.panY) / viewerState.zoom,
  };
}

function canvasToPdfCoordinates(canvasX, canvasY) {
  return {
    x: canvasX,

    y: viewerState.pageHeight - canvasY,
  };
}

function pdfToViewerCoordinates(pdfX, pdfY) {
  const canvasX = pdfX;

  const canvasY = viewerState.pageHeight - pdfY;

  return {
    x: viewerState.panX + canvasX * viewerState.zoom,

    y: viewerState.panY + canvasY * viewerState.zoom,
  };
}

function getViewerCoordinatesFromEvent(event) {
  const rect = viewerElement.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,

    y: event.clientY - rect.top,
  };
}

function viewerToPdfCoordinates(viewerX, viewerY) {
  const canvasPoint = viewerToCanvasCoordinates(viewerX, viewerY);

  return canvasToPdfCoordinates(canvasPoint.x, canvasPoint.y);
}

function normalizePdfSelection(startPdf, endPdf) {
  const left = Math.min(startPdf.x, endPdf.x);

  const right = Math.max(startPdf.x, endPdf.x);

  const bottom = Math.min(startPdf.y, endPdf.y);

  const top = Math.max(startPdf.y, endPdf.y);

  return {
    page: viewerState.currentPage,

    x: left,

    y: bottom,

    width: right - left,

    height: top - bottom,
  };
}

function clampPdfPoint(pdfPoint) {
  return {
    x: clamp(pdfPoint.x, 0, viewerState.pageWidth),

    y: clamp(pdfPoint.y, 0, viewerState.pageHeight),
  };
}

function isPdfPointInsidePage(pdfPoint) {
  return (
    pdfPoint.x >= 0 &&
    pdfPoint.x <= viewerState.pageWidth &&
    pdfPoint.y >= 0 &&
    pdfPoint.y <= viewerState.pageHeight
  );
}

function isPdfPointInsideSelection(pdfPoint, selection) {
  if (!selection || selection.page !== viewerState.currentPage) {
    return false;
  }

  return (
    pdfPoint.x >= selection.x &&
    pdfPoint.x <= selection.x + selection.width &&
    pdfPoint.y >= selection.y &&
    pdfPoint.y <= selection.y + selection.height
  );
}

function updateSelectionPanel() {
  if (!viewerState.activeSelection) {
    selectionPanelElement.hidden = true;

    selectionPanelContentElement.textContent = "Nenhuma Ã¡rea selecionada.";

    return;
  }

  const selection = viewerState.activeSelection;

  selectionPanelElement.hidden = false;

  selectionPanelContentElement.innerHTML = `
    <p>Nenhuma entidade IFC carregada nesta fase.</p>
    <dl>
      <div>
        <dt>PÃ¡gina</dt>
        <dd>${selection.page}</dd>
      </div>
      <div>
        <dt>X</dt>
        <dd>${Math.round(selection.x)}</dd>
      </div>
      <div>
        <dt>Y</dt>
        <dd>${Math.round(selection.y)}</dd>
      </div>
      <div>
        <dt>Largura</dt>
        <dd>${Math.round(selection.width)}</dd>
      </div>
      <div>
        <dt>Altura</dt>
        <dd>${Math.round(selection.height)}</dd>
      </div>
    </dl>
  `;
}

function updateSelectionOverlay() {
  const selection = viewerState.activeSelection;

  if (!selection || selection.page !== viewerState.currentPage) {
    selectionOverlayElement.hidden = true;

    return;
  }

  const topLeft = pdfToViewerCoordinates(
    selection.x,
    selection.y + selection.height,
  );

  const bottomRight = pdfToViewerCoordinates(
    selection.x + selection.width,
    selection.y,
  );

  selectionOverlayElement.hidden = false;

  selectionOverlayElement.style.left = `${topLeft.x}px`;
  selectionOverlayElement.style.top = `${topLeft.y}px`;
  selectionOverlayElement.style.width = `${bottomRight.x - topLeft.x}px`;
  selectionOverlayElement.style.height = `${bottomRight.y - topLeft.y}px`;
}

function setInteractionMode(mode) {
  if (mode !== "pan" && mode !== "selection") {
    logWarning(`Modo de interaÃ§Ã£o invÃ¡lido: ${mode}`);

    return;
  }

  viewerState.interactionMode = mode;

  panModeButton.classList.toggle("is-active", mode === "pan");
  panModeButton.setAttribute("aria-pressed", String(mode === "pan"));

  selectionModeButton.classList.toggle("is-active", mode === "selection");
  selectionModeButton.setAttribute("aria-pressed", String(mode === "selection"));

  viewerElement.classList.toggle("is-selection-mode", mode === "selection");

  setStatus(mode === "selection" ? "Modo seleÃ§Ã£o ativo" : "Modo mover ativo");

  log("Modo de interaÃ§Ã£o alterado", { mode });
}

function clearSelection(reason = "SeleÃ§Ã£o removida.") {
  if (!viewerState.activeSelection && !viewerState.isSelecting) {
    return;
  }

  viewerState.isSelecting = false;

  viewerState.selectionStartPdf = null;

  viewerState.activeSelection = null;

  selectionOverlayElement.hidden = true;

  updateSelectionPanel();

  setStatus(reason);

  log(reason);
}

function startSelection(event) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  const viewerPoint = getViewerCoordinatesFromEvent(event);

  const pdfPoint = viewerToPdfCoordinates(viewerPoint.x, viewerPoint.y);

  if (!isPdfPointInsidePage(pdfPoint)) {
    clearSelection("Clique fora da planta removeu a seleÃ§Ã£o.");

    return;
  }

  if (isPdfPointInsideSelection(pdfPoint, viewerState.activeSelection)) {
    return;
  }

  viewerState.isSelecting = true;

  viewerState.selectionStartPdf = clampPdfPoint(pdfPoint);

  viewerState.activeSelection = {
    page: viewerState.currentPage,

    x: viewerState.selectionStartPdf.x,

    y: viewerState.selectionStartPdf.y,

    width: 0,

    height: 0,
  };

  viewerElement.classList.add("is-selecting");

  viewerElement.setPointerCapture(event.pointerId);

  updateSelectionOverlay();

  updateSelectionPanel();

  log("SeleÃ§Ã£o iniciada.", {
    page: viewerState.currentPage,

    x: Math.round(viewerState.selectionStartPdf.x),

    y: Math.round(viewerState.selectionStartPdf.y),
  });
}

function moveSelection(event) {
  if (!viewerState.isSelecting || !viewerState.selectionStartPdf) {
    return;
  }

  const viewerPoint = getViewerCoordinatesFromEvent(event);

  const pdfPoint = clampPdfPoint(
    viewerToPdfCoordinates(viewerPoint.x, viewerPoint.y),
  );

  viewerState.activeSelection = normalizePdfSelection(
    viewerState.selectionStartPdf,
    pdfPoint,
  );

  updateSelectionOverlay();
}

function endSelection(event) {
  if (!viewerState.isSelecting) {
    return;
  }

  viewerState.isSelecting = false;

  viewerState.selectionStartPdf = null;

  viewerElement.classList.remove("is-selecting");

  if (viewerElement.hasPointerCapture(event.pointerId)) {
    viewerElement.releasePointerCapture(event.pointerId);
  }

  const selection = viewerState.activeSelection;

  if (!selection || selection.width < 2 || selection.height < 2) {
    clearSelection("SeleÃ§Ã£o muito pequena foi ignorada.");

    return;
  }

  updateSelectionOverlay();

  updateSelectionPanel();

  setStatus("Ãrea selecionada");

  log("SeleÃ§Ã£o finalizada.", {
    page: selection.page,

    x: Math.round(selection.x),

    y: Math.round(selection.y),

    width: Math.round(selection.width),

    height: Math.round(selection.height),
  });
}

/*
|--------------------------------------------------------------------------
| Cancelamento de renderização
|--------------------------------------------------------------------------
*/

/**
 * Cancela a renderização atual do PDF.js.
 *
 * Isso é fundamental porque o PDF.js não permite
 * duas operações render() simultâneas no mesmo canvas.
 */
function cancelCurrentRender(reason = "Nova renderização solicitada.") {
  if (!viewerState.renderTask) {
    return;
  }

  log(`Cancelando renderização atual: ${reason}`);

  try {
    viewerState.renderTask.cancel();
  } catch (error) {
    logWarning("Não foi possível cancelar a renderização atual.", error);
  }

  viewerState.renderTask = null;

  viewerState.renderInProgress = false;
}

/*
|--------------------------------------------------------------------------
| Renderização do PDF
|--------------------------------------------------------------------------
*/

/**
 * Executa a renderização da página atual.
 */
async function renderCurrentPage() {
  if (!viewerState.pdfDocument) {
    logWarning("Tentativa de renderização sem PDF carregado.");

    return;
  }

  /*
   * Se já existe uma renderização em andamento,
   * ela precisa ser cancelada antes de utilizar
   * o mesmo canvas novamente.
   */
  cancelCurrentRender("Renderização mais recente solicitada.");

  const renderVersion = ++viewerState.renderVersion;

  viewerState.renderInProgress = true;

  viewerState.renderPending = false;

  log(`Iniciando renderização da página ${viewerState.currentPage}.`, {
    version: renderVersion,

    zoom: viewerState.zoom,
  });

  setStatus(`Renderizando página ${viewerState.currentPage}...`);

  try {
    const page = await viewerState.pdfDocument.getPage(viewerState.currentPage);

    /*
     * Verifica novamente se esta renderização
     * ainda é a versão atual.
     */
    if (renderVersion !== viewerState.renderVersion) {
      logWarning(
        "Renderização ignorada porque existe uma versão mais recente.",
      );

      return;
    }

    const viewport = page.getViewport({
      scale: viewerState.zoom,
    });

    const outputScale = window.devicePixelRatio || 1;

    const viewportWidth = viewport.width;

    const viewportHeight = viewport.height;

    viewerState.pageWidth = page.view[2] - page.view[0];

    viewerState.pageHeight = page.view[3] - page.view[1];

    viewerState.renderedWidth = viewportWidth;

    viewerState.renderedHeight = viewportHeight;

    /*
     * Preparamos o canvas.
     */
    canvasElement.width = Math.ceil(viewportWidth * outputScale);

    canvasElement.height = Math.ceil(viewportHeight * outputScale);

    canvasElement.style.width = `${viewportWidth}px`;

    canvasElement.style.height = `${viewportHeight}px`;

    canvasContext.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    /*
     * Criamos a tarefa de renderização.
     *
     * Guardamos a referência para podermos
     * cancelar se o usuário alterar o zoom
     * antes da conclusão.
     */
    const renderTask = page.render({
      canvasContext,
      viewport,
    });

    viewerState.renderTask = renderTask;

    await renderTask.promise;

    /*
     * Se outra renderização começou enquanto
     * esta estava terminando, descartamos esta.
     */
    if (renderVersion !== viewerState.renderVersion) {
      logWarning(
        "Renderização concluída, mas foi descartada por uma versão mais recente.",
      );

      return;
    }

    viewerState.renderTask = null;

    viewerState.renderInProgress = false;

    updateZoomInterface();

    updatePageInterface();

    applyCanvasTransform();

    setStatus(`Página ${viewerState.currentPage} carregada`);

    log(`Página ${viewerState.currentPage} renderizada com sucesso.`, {
      pageWidth: Math.round(viewerState.pageWidth),

      pageHeight: Math.round(viewerState.pageHeight),

      renderedWidth: Math.round(viewerState.renderedWidth),

      renderedHeight: Math.round(viewerState.renderedHeight),

      zoom: viewerState.zoom,

      version: renderVersion,
    });
  } catch (error) {
    /*
     * PDF.js lança RenderingCancelledException
     * quando cancelamos uma renderização.
     *
     * Isso NÃO é um erro real do aplicativo.
     */
    if (error?.name === "RenderingCancelledException") {
      log("Renderização cancelada normalmente.", {
        version: renderVersion,
      });

      return;
    }

    /*
     * Se esta renderização não é mais a atual,
     * não precisamos tratar seu erro como erro
     * da interface.
     */
    if (renderVersion !== viewerState.renderVersion) {
      logWarning("Erro de uma renderização antiga foi ignorado.", error);

      return;
    }

    viewerState.renderTask = null;

    viewerState.renderInProgress = false;

    logError(`Erro ao renderizar a página ${viewerState.currentPage}.`, error);

    throw error;
  } finally {
    if (renderVersion === viewerState.renderVersion) {
      viewerState.renderTask = null;

      viewerState.renderInProgress = false;
    }
  }
}

/*
|--------------------------------------------------------------------------
| Agendamento de renderização
|--------------------------------------------------------------------------
*/

/**
 * Agenda uma renderização para o próximo frame
 * do navegador.
 *
 * Isso impede que dezenas de eventos de scroll
 * iniciem dezenas de renderizações simultâneas.
 */
function scheduleRender(reason = "Atualização visual.") {
  viewerState.renderPending = true;

  /*
   * Já existe uma renderização agendada.
   */
  if (viewerState.renderRequestId !== null) {
    return;
  }

  viewerState.renderRequestId = requestAnimationFrame(async () => {
    viewerState.renderRequestId = null;

    if (!viewerState.renderPending) {
      return;
    }

    viewerState.renderPending = false;

    log(`Executando renderização agendada: ${reason}`);

    try {
      await renderCurrentPage();
    } catch (error) {
      logError("Falha na renderização agendada.", error);
    }
  });
}

/**
 * Cancela uma renderização agendada que ainda
 * não começou.
 */
function cancelScheduledRender() {
  if (viewerState.renderRequestId === null) {
    return;
  }

  cancelAnimationFrame(viewerState.renderRequestId);

  viewerState.renderRequestId = null;

  viewerState.renderPending = false;

  log("Renderização agendada cancelada.");
}

/*
|--------------------------------------------------------------------------
| Zoom
|--------------------------------------------------------------------------
*/

/**
 * Altera o zoom preservando o ponto do cursor.
 *
 * A atualização do estado acontece imediatamente.
 * A renderização do PDF é agendada para evitar
 * concorrência durante scroll rápido.
 */
function setZoom(
  newZoom,
  viewerX = viewerElement.clientWidth / 2,
  viewerY = viewerElement.clientHeight / 2,
) {
  const oldZoom = viewerState.zoom;

  newZoom = clamp(roundZoom(newZoom), MIN_ZOOM, MAX_ZOOM);

  if (newZoom === oldZoom) {
    return;
  }

  const canvasPoint = viewerToCanvasCoordinates(viewerX, viewerY);

  viewerState.zoom = newZoom;

  viewerState.panX = viewerX - canvasPoint.x * viewerState.zoom;

  viewerState.panY = viewerY - canvasPoint.y * viewerState.zoom;

  updateZoomInterface();

  applyCanvasTransform();

  log("Zoom alterado", {
    anterior: `${Math.round(oldZoom * 100)}%`,

    atual: `${Math.round(newZoom * 100)}%`,

    ponto: {
      x: Math.round(viewerX),

      y: Math.round(viewerY),
    },
  });

  /*
   * Agenda somente a renderização mais recente.
   */
  scheduleRender("Alteração de zoom.");
}

function zoomIn(
  viewerX = viewerElement.clientWidth / 2,
  viewerY = viewerElement.clientHeight / 2,
) {
  const nextZoom = roundZoom(viewerState.zoom + ZOOM_STEP);

  setZoom(nextZoom, viewerX, viewerY);
}

function zoomOut(
  viewerX = viewerElement.clientWidth / 2,
  viewerY = viewerElement.clientHeight / 2,
) {
  const nextZoom = roundZoom(viewerState.zoom - ZOOM_STEP);

  setZoom(nextZoom, viewerX, viewerY);
}

async function resetView() {
  log("Resetando visualização.");

  /*
   * Cancelamos qualquer renderização pendente
   * ou em andamento.
   */
  cancelScheduledRender();

  cancelCurrentRender("Reset da visualização.");

  viewerState.zoom = INITIAL_ZOOM;

  updateZoomInterface();

  await renderCurrentPage();

  centerPage();

  updateZoomInterface();

  setStatus(`Página ${viewerState.currentPage} centralizada`);
}

/*
|--------------------------------------------------------------------------
| Paginação
|--------------------------------------------------------------------------
*/

async function goToPage(pageNumber) {
  if (!viewerState.pdfDocument) {
    return;
  }

  if (pageNumber < 1 || pageNumber > viewerState.totalPages) {
    logWarning(`Página inválida solicitada: ${pageNumber}`);

    return;
  }

  log(`Mudando da página ${viewerState.currentPage} para ${pageNumber}.`);

  cancelScheduledRender();

  cancelCurrentRender("Mudança de página.");

  viewerState.currentPage = pageNumber;

  viewerState.panX = 0;
  viewerState.panY = 0;

  clearSelection("SeleÃ§Ã£o removida ao trocar de pÃ¡gina.");

  await renderCurrentPage();

  centerPage();

  updatePageInterface();
}

async function previousPage() {
  await goToPage(viewerState.currentPage - 1);
}

async function nextPage() {
  await goToPage(viewerState.currentPage + 1);
}

/*
|--------------------------------------------------------------------------
| Pan
|--------------------------------------------------------------------------
*/

function startPan(event) {
  if (viewerState.interactionMode !== "pan") {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  viewerState.isPanning = true;

  viewerState.pointerStartX = event.clientX;

  viewerState.pointerStartY = event.clientY;

  viewerState.panStartX = viewerState.panX;

  viewerState.panStartY = viewerState.panY;

  viewerElement.classList.add("is-panning");

  viewerElement.setPointerCapture(event.pointerId);

  log("Pan iniciado.");
}

function movePan(event) {
  if (!viewerState.isPanning) {
    return;
  }

  const deltaX = event.clientX - viewerState.pointerStartX;

  const deltaY = event.clientY - viewerState.pointerStartY;

  viewerState.panX = viewerState.panStartX + deltaX;

  viewerState.panY = viewerState.panStartY + deltaY;

  applyCanvasTransform();
}

function endPan(event) {
  if (!viewerState.isPanning) {
    return;
  }

  viewerState.isPanning = false;

  viewerElement.classList.remove("is-panning");

  if (viewerElement.hasPointerCapture(event.pointerId)) {
    viewerElement.releasePointerCapture(event.pointerId);
  }

  log("Pan finalizado", {
    panX: Math.round(viewerState.panX),

    panY: Math.round(viewerState.panY),
  });
}

/*
|--------------------------------------------------------------------------
| Roda do mouse
|--------------------------------------------------------------------------
|
| Ctrl + roda:
|   Zoom
|
| Roda normal:
|   Pan
|--------------------------------------------------------------------------
*/

function handleWheel(event) {
  event.preventDefault();

  const rect = viewerElement.getBoundingClientRect();

  const viewerX = event.clientX - rect.left;

  const viewerY = event.clientY - rect.top;

  /*
   * Ctrl + roda = zoom.
   */
  if (event.ctrlKey) {
    const direction = event.deltaY < 0 ? 1 : -1;

    const nextZoom = roundZoom(viewerState.zoom + direction * ZOOM_STEP);

    setZoom(nextZoom, viewerX, viewerY);

    return;
  }

  /*
   * Roda normal = pan.
   */
  viewerState.panX -= event.deltaX;

  viewerState.panY -= event.deltaY;

  applyCanvasTransform();

  /*
   * Evita poluir o console.
   */
  const now = Date.now();

  if (now - viewerState.lastWheelLogTime > 500) {
    log("Pan por roda do mouse", {
      panX: Math.round(viewerState.panX),

      panY: Math.round(viewerState.panY),
    });

    viewerState.lastWheelLogTime = now;
  }
}

/*
|--------------------------------------------------------------------------
| Duplo clique
|--------------------------------------------------------------------------
*/

function handleDoubleClick(event) {
  if (viewerState.interactionMode === "selection") {
    return;
  }

  const rect = viewerElement.getBoundingClientRect();

  const viewerX = event.clientX - rect.left;

  const viewerY = event.clientY - rect.top;

  log("Duplo clique detectado. Aplicando zoom.");

  zoomIn(viewerX, viewerY);
}

function handlePointerDown(event) {
  if (viewerState.interactionMode === "selection") {
    startSelection(event);

    return;
  }

  startPan(event);
}

function handlePointerMove(event) {
  if (viewerState.interactionMode === "selection") {
    moveSelection(event);

    return;
  }

  movePan(event);
}

function handlePointerEnd(event) {
  if (viewerState.interactionMode === "selection") {
    endSelection(event);

    return;
  }

  endPan(event);
}

/*
|--------------------------------------------------------------------------
| Eventos
|--------------------------------------------------------------------------
*/

zoomInButton.addEventListener("click", () => {
  zoomIn();
});

zoomOutButton.addEventListener("click", () => {
  zoomOut();
});

resetViewButton.addEventListener("click", () => {
  resetView();
});

previousPageButton.addEventListener("click", () => {
  previousPage();
});

nextPageButton.addEventListener("click", () => {
  nextPage();
});

panModeButton.addEventListener("click", () => {
  setInteractionMode("pan");
});

selectionModeButton.addEventListener("click", () => {
  setInteractionMode("selection");
});

clearSelectionButton.addEventListener("click", () => {
  clearSelection();
});

viewerElement.addEventListener("pointerdown", handlePointerDown);

viewerElement.addEventListener("pointermove", handlePointerMove);

viewerElement.addEventListener("pointerup", handlePointerEnd);

viewerElement.addEventListener("pointercancel", handlePointerEnd);

viewerElement.addEventListener("wheel", handleWheel, {
  passive: false,
});

viewerElement.addEventListener("dblclick", handleDoubleClick);

/*
|--------------------------------------------------------------------------
| Teclado
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Redimensionamento
|--------------------------------------------------------------------------
*/

window.addEventListener("resize", () => {
  if (!viewerState.pdfDocument) {
    return;
  }

  centerPage();

  log("Visualizador redimensionado.");
});

/*
|--------------------------------------------------------------------------
| Carregamento do PDF
|--------------------------------------------------------------------------
*/

async function loadPdf() {
  try {
    log(`Iniciando carregamento do PDF: ${PDF_FILE}`);

    setStatus("Carregando documento...");

    const loadingTask = pdfjsLib.getDocument({
      url: PDF_FILE,
    });

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

    loadingElement.hidden = true;

    errorElement.hidden = true;

    viewerElement.hidden = false;

    log("Interface do visualizador ativada.");

    await renderCurrentPage();

    centerPage();

    updateZoomInterface();

    setStatus(`PDF carregado · ${viewerState.totalPages} página(s)`);

    log("Visualizador inicializado com sucesso.");
  } catch (error) {
    logError("Erro ao carregar PDF.", error);

    loadingElement.hidden = true;

    viewerElement.hidden = true;

    errorElement.hidden = false;

    log("Interface de erro ativada.");

    errorMessageElement.textContent =
      error?.message || "Ocorreu um erro desconhecido ao carregar o PDF.";

    setStatus("Erro ao carregar PDF");
  }
}

/*
|--------------------------------------------------------------------------
| Inicialização
|--------------------------------------------------------------------------
*/

async function initialize() {
  log("========================================");

  log("Iniciando Editor de Planta Baixa...");

  log("========================================");

  log("Configurações", {
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

  await loadPdf();
}

initialize();
