import {
  findIfcEntitiesForSelection,
  summarizeIfcProducts,
} from "../ifc/ifcService.js";

export function renderSelectionPanel({
  panelElement,
  contentElement,
  selection,
  selectedAnnotation,
  ifcModel,
  pdfItems = [],
  pageBounds,
  onSaveAnnotation,
  onDeleteAnnotation,
  onViewSelectionIn3d,
}) {
  if (!selection) {
    panelElement.hidden = true;
    contentElement.innerHTML = "Nenhuma area selecionada.";
    return;
  }

  const ifcResult = findIfcEntitiesForSelection(ifcModel, selection, pageBounds);
  const ifcSummary = ifcModel ? summarizeIfcProducts(ifcModel.products).slice(0, 8) : [];

  panelElement.hidden = false;
  contentElement.innerHTML = `
    <section class="panel-section">
      <h3>Area</h3>
      <dl>
        <div><dt>Tipo</dt><dd>${escapeHtml(getSelectionTypeLabel(selection))}</dd></div>
        <div><dt>Vertices</dt><dd>${selection.points?.length || 4}</dd></div>
        <div><dt>Pagina</dt><dd>${selection.page}</dd></div>
        <div><dt>X</dt><dd>${Math.round(selection.x)}</dd></div>
        <div><dt>Y</dt><dd>${Math.round(selection.y)}</dd></div>
        <div><dt>Largura</dt><dd>${Math.round(selection.width)}</dd></div>
        <div><dt>Altura</dt><dd>${Math.round(selection.height)}</dd></div>
      </dl>
    </section>

    <section class="panel-section">
      <h3>IFC</h3>
      <p>${escapeHtml(ifcResult.status)}</p>
      <div class="ifc-summary">
        ${
          ifcModel
            ? `<strong>${ifcModel.products.length}</strong> entidades carregadas`
            : "Carregando IFC..."
        }
      </div>
      ${renderIfcAlignment(ifcResult.alignment, ifcResult.ifcSelection)}
      ${renderIfcEntities(ifcResult.entities)}
      <button id="viewSelectionIn3dButton" class="panel-button" type="button" ${
        ifcResult.entities.length ? "" : "disabled"
      }>Visualizar em 3D</button>
      ${renderIfcSummary(ifcSummary)}
    </section>

    <section class="panel-section">
      <h3>Itens PDF</h3>
      <p>${pdfItems.length} item(ns) vetorial(is) identificado(s) na area.</p>
      ${renderPdfItems(pdfItems)}
    </section>

    <section class="panel-section">
      <h3>Anotacao</h3>
      <textarea id="annotationTextInput" class="annotation-text-input" rows="4" placeholder="Texto da anotacao">${escapeHtml(
        selectedAnnotation?.text || "",
      )}</textarea>
      ${renderAnnotationGeometryControls(selectedAnnotation, selection)}
      <div class="annotation-actions">
        <button id="saveAnnotationButton" class="panel-button" type="button">${
          selectedAnnotation ? "Atualizar" : "Inserir"
        }</button>
        <button id="deleteAnnotationButton" class="panel-button" type="button" ${
          selectedAnnotation ? "" : "disabled"
        }>Apagar</button>
      </div>
    </section>
  `;

  document
    .getElementById("saveAnnotationButton")
    ?.addEventListener("click", onSaveAnnotation);
  document
    .getElementById("deleteAnnotationButton")
    ?.addEventListener("click", onDeleteAnnotation);
  document
    .getElementById("viewSelectionIn3dButton")
    ?.addEventListener("click", onViewSelectionIn3d);
}

function renderPdfItems(items) {
  if (!items.length) {
    return "";
  }

  return `
    <ul class="pdf-item-list">
      ${items
        .slice(0, 40)
        .map(
          (item, index) => `
            <li>
              <strong>${escapeHtml(item.label)} ${index + 1}</strong>
              <span>
                ${escapeHtml(item.type)}
                · x ${Math.round(item.bounds.x)}
                · y ${Math.round(item.bounds.y)}
                · ${Math.round(item.bounds.width)} x ${Math.round(item.bounds.height)}
              </span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function getSelectionTypeLabel(selection) {
  return selection.type === "polygon" ? "Poligono" : "Retangulo";
}

function renderAnnotationGeometryControls(annotation, selection) {
  const width = Math.round(annotation?.textWidth ?? selection.width);
  const height = Math.round(annotation?.textHeight ?? selection.height);
  const rotation = Math.round(annotation?.textRotation ?? 0);

  return `
    <div class="annotation-geometry-controls">
      <label>
        <span>Largura texto</span>
        <input id="annotationTextWidthInput" type="number" min="10" step="1" value="${width}" />
      </label>
      <label>
        <span>Altura texto</span>
        <input id="annotationTextHeightInput" type="number" min="8" step="1" value="${height}" />
      </label>
      <label>
        <span>Rotacao</span>
        <input id="annotationTextRotationInput" type="number" min="0" max="359" step="1" value="${rotation}" />
      </label>
    </div>
  `;
}

function renderIfcEntities(entities) {
  if (!entities.length) {
    return "";
  }

  return `
    <ul class="ifc-entity-list">
      ${entities
        .map(
          (entity) => `
            <li>
              <strong>${escapeHtml(entity.name)}</strong>
              <span>
                ${escapeHtml(entity.type)} #${entity.stepId}
                ${renderEntityBounds(entity)}
              </span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function renderIfcAlignment(alignment, ifcSelection) {
  if (!alignment || !ifcSelection) {
    return "";
  }

  return `
    <dl class="ifc-transform">
      <div><dt>Alinhamento</dt><dd>${escapeHtml(alignment.source)}</dd></div>
      <div><dt>IFC X</dt><dd>${Math.round(ifcSelection.x)}</dd></div>
      <div><dt>IFC Y</dt><dd>${Math.round(ifcSelection.y)}</dd></div>
      <div><dt>IFC area</dt><dd>${Math.round(ifcSelection.width)} x ${Math.round(
        ifcSelection.height,
      )}</dd></div>
    </dl>
  `;
}

function renderEntityBounds(entity) {
  if (!entity.pdfBounds) {
    return "";
  }

  return ` · PDF ${Math.round(entity.pdfBounds.x)}, ${Math.round(
    entity.pdfBounds.y,
  )}`;
}

function renderIfcSummary(summary) {
  if (!summary.length) {
    return "";
  }

  return `
    <ul class="ifc-type-list">
      ${summary
        .map(
          (item) =>
            `<li><span>${escapeHtml(item.type)}</span><strong>${item.count}</strong></li>`,
        )
        .join("")}
    </ul>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
