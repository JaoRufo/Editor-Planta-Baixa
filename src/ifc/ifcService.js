import { parseIfcText } from "./ifcParser.js";

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

  if (!ifcModel.modelBounds || !pageBounds?.width || !pageBounds?.height) {
    return {
      entities: [],
      status: "IFC carregado sem geometria suficiente para cruzamento.",
    };
  }

  const entities = ifcModel.products
    .map((product) => ({
      ...product,
      pdfBounds: mapIfcBoundsToPdf(product.bounds, ifcModel.modelBounds, pageBounds),
    }))
    .filter((product) => product.pdfBounds)
    .filter((product) => rectanglesIntersect(product.pdfBounds, selection))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

  return {
    entities,
    status: entities.length
      ? `${entities.length} entidade(s) IFC encontrada(s) por calibracao automatica.`
      : "Nenhuma entidade IFC encontrada na area selecionada.",
  };
}

function mapIfcBoundsToPdf(bounds, modelBounds, pageBounds) {
  if (!bounds || !modelBounds.width || !modelBounds.height) {
    return null;
  }

  const scaleX = pageBounds.width / modelBounds.width;
  const scaleY = pageBounds.height / modelBounds.height;

  const minX = (bounds.minX - modelBounds.minX) * scaleX;
  const maxX = (bounds.maxX - modelBounds.minX) * scaleX;
  const minY = (bounds.minY - modelBounds.minY) * scaleY;
  const maxY = (bounds.maxY - modelBounds.minY) * scaleY;

  return {
    page: pageBounds.page,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
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
