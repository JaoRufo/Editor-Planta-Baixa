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

export function findIfcEntitiesForSelection(ifcModel, selection) {
  if (!ifcModel || !selection) {
    return {
      entities: [],
      status: "IFC indisponivel.",
    };
  }

  return {
    entities: [],
    status:
      "IFC carregado, mas a intersecao espacial depende da calibracao PDF/IFC.",
  };
}
