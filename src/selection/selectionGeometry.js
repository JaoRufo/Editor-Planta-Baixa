export function normalizePdfSelection(page, startPdf, endPdf) {
  const left = Math.min(startPdf.x, endPdf.x);
  const right = Math.max(startPdf.x, endPdf.x);
  const bottom = Math.min(startPdf.y, endPdf.y);
  const top = Math.max(startPdf.y, endPdf.y);

  return {
    type: "rectangle",
    page,
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    points: [
      { x: left, y: bottom },
      { x: right, y: bottom },
      { x: right, y: top },
      { x: left, y: top },
    ],
  };
}

export function createPdfPolygonSelection(page, points) {
  const bounds = getPdfPointsBounds(points);

  return {
    type: "polygon",
    page,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    points: points.map((point) => ({ x: point.x, y: point.y })),
  };
}

export function getPdfPointsBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);

  return {
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
  };
}

export function isPdfPointInsideSelection(pdfPoint, selection, page) {
  if (!selection || selection.page !== page) {
    return false;
  }

  if (selection.type === "polygon" && selection.points?.length >= 3) {
    return isPointInsidePolygon(pdfPoint, selection.points);
  }

  return (
    pdfPoint.x >= selection.x &&
    pdfPoint.x <= selection.x + selection.width &&
    pdfPoint.y >= selection.y &&
    pdfPoint.y <= selection.y + selection.height
  );
}

function isPointInsidePolygon(point, polygonPoints) {
  let isInside = false;

  for (
    let index = 0, previousIndex = polygonPoints.length - 1;
    index < polygonPoints.length;
    previousIndex = index, index += 1
  ) {
    const current = polygonPoints[index];
    const previous = polygonPoints[previousIndex];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}
