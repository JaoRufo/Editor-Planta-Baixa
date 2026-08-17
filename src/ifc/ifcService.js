import { parseIfcText } from "./ifcParser.js";
import {
  getIfcPdfAlignment,
  isImportantIfcEntity,
  mapIfcEntityToPdf,
  mapPdfSelectionToIfc,
} from "./ifcAlignment.js";

const IFC_FILE = "/assets/ifc/modelos/modelo.ifc";

export async function loadIfcModel() {
  const response = await fetch(IFC_FILE);

  if (!response.ok) {
    throw new Error(`Falha ao carregar IFC: ${response.status}`);
  }

  const text = await response.text();
  const parsed = parseIfcText(text);

  return {
    file: IFC_FILE,
    ...parsed,
  };
}

export function summarizeIfcProducts(products) {
  const counts = new Map();

  for (const product of products) {
    counts.set(product.type, (counts.get(product.type) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

export function findIfcEntitiesForSelection(ifcModel, selection, pageBounds) {
  if (!ifcModel || !selection) {
    return {
      entities: [],
      status: "IFC indisponivel.",
    };
  }

  if (!pageBounds?.width || !pageBounds?.height) {
    return {
      entities: [],
      status: "PDF sem dimensoes suficientes para cruzamento IFC.",
    };
  }

  const alignment = getIfcPdfAlignment();
  const ifcSelection = mapPdfSelectionToIfc(selection);
  const entities = ifcModel.products
    .filter(isImportantIfcEntity)
    .map((product) => ({
      ...product,
      pdfBounds: mapIfcEntityToPdf(product, pageBounds.page),
    }))
    .filter((product) => product.pdfBounds)
    .filter((product) => rectanglesIntersect(product.pdfBounds, selection))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

  return {
    entities,
    alignment,
    ifcSelection,
    status: entities.length
      ? `${entities.length} entidade(s) IFC encontrada(s) por alinhamento espacial calibrado.`
      : "Nenhuma entidade IFC encontrada na area selecionada.",
  };
}

function rectanglesIntersect(a, b) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}
