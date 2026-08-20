import { parseIfcText } from "./ifcParser.js";
import {
  getIfcPdfAlignment,
  isImportantIfcEntity,
  mapIfcEntityToPdf,
  mapPdfSelectionToIfc,
} from "./ifcAlignment.js";

const IFC_FILE = "/assets/ifc/modelos/modelo.ifc";

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadIfcModel() {
  const response = await fetch(IFC_FILE);

  if (!response.ok) {
    throw new Error(`Falha ao carregar IFC: ${response.status}`);
  }

  const text = await response.text();
  const parsed = parseIfcText(text);

  return { file: IFC_FILE, ...parsed };
}

/**
 * Parses an IFC from a File object (drag-and-drop / file input).
 * Returns the same shape as loadIfcModel().
 */
export async function loadIfcFromFile(file) {
  const text = await file.text();
  const parsed = parseIfcText(text);
  return { file: file.name, ...parsed };
}

// ─── Floors ───────────────────────────────────────────────────────────────────

export function getFloors(ifcModel) {
  return ifcModel?.floors ?? [];
}

/**
 * Returns products that belong to a specific floor.
 * Pass floorStepId = null to get products with no floor assignment.
 */
export function getProductsForFloor(ifcModel, floorStepId) {
  if (!ifcModel) return [];
  return ifcModel.products.filter((p) => p.floorStepId === floorStepId);
}

/**
 * Returns only IFCSPACE products, optionally filtered by floor.
 */
export function getSpaces(ifcModel, floorStepId = undefined) {
  if (!ifcModel) return [];
  return ifcModel.products.filter(
    (p) =>
      p.type === "IFCSPACE" &&
      (floorStepId === undefined || p.floorStepId === floorStepId),
  );
}

// ─── Summaries ────────────────────────────────────────────────────────────────

export function summarizeIfcProducts(products) {
  const counts = new Map();

  for (const product of products) {
    counts.set(product.type, (counts.get(product.type) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

// ─── Spatial queries ──────────────────────────────────────────────────────────

/**
 * Returns all IFC entities whose footprint intersects a PDF selection rectangle.
 * Optionally restricted to a specific floor.
 */
export function findIfcEntitiesForSelection(ifcModel, selection, pageBounds, floorStepId = undefined) {
  if (!ifcModel || !selection) {
    return { entities: [], status: "IFC indisponivel." };
  }

  if (!pageBounds?.width || !pageBounds?.height) {
    return {
      entities: [],
      status: "PDF sem dimensoes suficientes para cruzamento IFC.",
    };
  }

  const alignment = getIfcPdfAlignment();
  const ifcSelection = mapPdfSelectionToIfc(selection);

  const candidates = ifcModel.products
    .filter(isImportantIfcEntity)
    .filter((p) => floorStepId === undefined || p.floorStepId === floorStepId);

  const entities = candidates
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
      ? `${entities.length} entidade(s) IFC encontrada(s).`
      : "Nenhuma entidade IFC encontrada na area selecionada.",
  };
}

/**
 * Returns the topmost IFCSPACE whose footprint contains the given IFC-space point.
 * Useful for "click on floor plan → identify room" without a PDF alignment matrix.
 */
export function findSpaceAtPoint(ifcModel, x, y, floorStepId = undefined) {
  if (!ifcModel) return null;

  const spaces = getSpaces(ifcModel, floorStepId).filter((s) => s.points?.length >= 3);

  // Iterate reversed so the last-drawn (topmost) space wins on overlap
  for (let i = spaces.length - 1; i >= 0; i -= 1) {
    if (pointInPolygon(x, y, spaces[i].points)) return spaces[i];
  }

  return null;
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function rectanglesIntersect(a, b) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

/**
 * Ray-casting point-in-polygon test (works for any simple polygon).
 */
function pointInPolygon(x, y, points) {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;

    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}
