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
  pageBounds,
  onSaveAnnotation,
  onDeleteAnnotation,
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
      ${renderIfcEntities(ifcResult.entities)}
      ${renderIfcSummary(ifcSummary)}
    </section>

    <section class="panel-section">
      <h3>Anotacao</h3>
      <textarea id="annotationTextInput" class="annotation-text-input" rows="4" placeholder="Texto da anotacao">${escapeHtml(
        selectedAnnotation?.text || "",
      )}</textarea>
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
}

function renderIfcEntities(entities) {
  if (!entities.length) {
    return "";
  }

  return `
    <ul class="ifc-entity-list">
      ${entities
        .slice(0, 20)
        .map(
          (entity) => `
            <li>
              <strong>${escapeHtml(entity.name)}</strong>
              <span>${escapeHtml(entity.type)} #${entity.stepId}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
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
