// Matriz affine IFC -> PDF calculada a partir dos 16 IfcSpace do IFC e
// dos rotulos correspondentes do PDF de zonas, que compartilha a base do layout.
// As coordenadas IFC permanecem em milimetros reais; a matriz so projeta para PDF.
const IFC_TO_PDF_MATRIX = {
  a: -0.02157839800344643,
  b: -0.005063280375340193,
  c: 0.011559073551464821,
  d: -0.028146125716361176,
  e: 600.3920639628732,
  f: 909.5841707785326,
};

const IMPORTANT_IFC_TYPES = new Set([
  "IFCSPACE",
  "IFCWALL",
  "IFCWALLSTANDARDCASE",
  "IFCDOOR",
  "IFCWINDOW",
  "IFCCOLUMN",
  "IFCSLAB",
  "IFCCOVERING",
  "IFCFURNISHINGELEMENT",
  "IFCFLOWTERMINAL",
  "IFCCURTAINWALL",
  "IFCMEMBER",
  "IFCPLATE",
  "IFCRAILING",
  "IFCSTAIR",
  "IFCRAMP",
  "IFCROOF",
  "IFCBUILDINGELEMENTPROXY",
]);

export function getIfcPdfAlignment() {
  return {
    source: "16 IfcSpace x PDF zonas",
    matrix: IFC_TO_PDF_MATRIX,
    inverse: invertMatrix(IFC_TO_PDF_MATRIX),
  };
}

export function isImportantIfcEntity(entity) {
  return IMPORTANT_IFC_TYPES.has(entity.type);
}

export function mapIfcEntityToPdf(entity, page) {
  const points = getEntityPoints(entity);

  if (!points.length) {
    return null;
  }

  const pdfPoints = points.map((point) => transformPoint(IFC_TO_PDF_MATRIX, point));
  const bounds = getPointBounds(pdfPoints);

  return {
    page,
    ...bounds,
    points: pdfPoints,
  };
}

export function mapPdfSelectionToIfc(selection) {
  const alignment = getIfcPdfAlignment();
  const points = getSelectionPoints(selection).map((point) =>
    transformPoint(alignment.inverse, point),
  );
  const bounds = getPointBounds(points);

  return {
    type: selection.type || "rectangle",
    page: selection.page,
    ...bounds,
    points,
  };
}

function getEntityPoints(entity) {
  if (entity.points?.length) {
    return entity.points;
  }

  if (!entity.bounds) {
    return [];
  }

  return [
    { x: entity.bounds.minX, y: entity.bounds.minY },
    { x: entity.bounds.maxX, y: entity.bounds.minY },
    { x: entity.bounds.maxX, y: entity.bounds.maxY },
    { x: entity.bounds.minX, y: entity.bounds.maxY },
  ];
}

function getSelectionPoints(selection) {
  if (selection.points?.length) {
    return selection.points;
  }

  return [
    { x: selection.x, y: selection.y },
    { x: selection.x + selection.width, y: selection.y },
    { x: selection.x + selection.width, y: selection.y + selection.height },
    { x: selection.x, y: selection.y + selection.height },
  ];
}

function transformPoint(matrix, point) {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function invertMatrix(matrix) {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  };
}

function getPointBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
