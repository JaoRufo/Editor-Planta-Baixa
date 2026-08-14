export function normalizePdfSelection(page, startPdf, endPdf) {
  const left = Math.min(startPdf.x, endPdf.x);
  const right = Math.max(startPdf.x, endPdf.x);
  const bottom = Math.min(startPdf.y, endPdf.y);
  const top = Math.max(startPdf.y, endPdf.y);

  return {
    page,
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

  return (
    pdfPoint.x >= selection.x &&
    pdfPoint.x <= selection.x + selection.width &&
    pdfPoint.y >= selection.y &&
    pdfPoint.y <= selection.y + selection.height
  );
}
