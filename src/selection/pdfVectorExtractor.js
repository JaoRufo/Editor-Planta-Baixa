const DRAW_OPS = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  quadraticCurveTo: 3,
  closePath: 4,
};

export async function extractPdfVectorItems(page, pageNumber, pdfjsLib) {
  const operatorList = await page.getOperatorList();
  const ops = pdfjsLib.OPS;
  const items = [];
  const graphicsState = createGraphicsState();
  let currentPoint = null;
  let itemIndex = 0;

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index];
    const args = operatorList.argsArray[index] || [];

    if (fn === ops.save) {
      graphicsState.save();
      continue;
    }

    if (fn === ops.restore) {
      graphicsState.restore();
      continue;
    }

    if (fn === ops.transform) {
      graphicsState.transform(args);
      continue;
    }

    if (fn === ops.setLineWidth) {
      graphicsState.lineWidth = Number(args[0]) || graphicsState.lineWidth;
      continue;
    }

    if (fn === ops.constructPath) {
      const pathItems = parseConstructedPath({
        args,
        pageNumber,
        itemIndex,
        transform: graphicsState.currentTransform,
        lineWidth: graphicsState.lineWidth,
      });

      items.push(...pathItems);
      itemIndex += pathItems.length;
      currentPoint = null;
      continue;
    }

    if (fn === ops.moveTo) {
      currentPoint = transformPoint(args[0], args[1], graphicsState.currentTransform);
      continue;
    }

    if (fn === ops.lineTo && currentPoint) {
      const endPoint = transformPoint(args[0], args[1], graphicsState.currentTransform);
      const item = createVectorItem({
        pageNumber,
        itemIndex,
        type: "line",
        label: "Linha",
        points: [currentPoint, endPoint],
        lineWidth: graphicsState.lineWidth,
      });

      if (item) {
        items.push(item);
        itemIndex += 1;
      }

      currentPoint = endPoint;
      continue;
    }

    if (fn === ops.rectangle) {
      const [x, y, width, height] = args;
      const points = [
        transformPoint(x, y, graphicsState.currentTransform),
        transformPoint(x + width, y, graphicsState.currentTransform),
        transformPoint(x + width, y + height, graphicsState.currentTransform),
        transformPoint(x, y + height, graphicsState.currentTransform),
      ];
      const item = createVectorItem({
        pageNumber,
        itemIndex,
        type: "rectangle",
        label: "Retangulo",
        points,
        lineWidth: graphicsState.lineWidth,
        closed: true,
      });

      if (item) {
        items.push(item);
        itemIndex += 1;
      }
    }
  }

  return items.filter((item) => item.bounds.width > 0 || item.bounds.height > 0);
}

export function findPdfVectorItemsForSelection(items, selection) {
  if (!selection) {
    return [];
  }

  return items
    .filter((item) => item.page === selection.page)
    .filter((item) => rectanglesIntersect(item.bounds, selection))
    .sort((a, b) => area(a.bounds) - area(b.bounds))
    .slice(0, 300);
}

function parseConstructedPath({ args, pageNumber, itemIndex, transform, lineWidth }) {
  const pathData = getPathData(args);

  if (!pathData.length) {
    return [];
  }

  const items = [];
  let cursor = 0;
  let currentPoint = null;
  let firstPoint = null;
  let localIndex = itemIndex;

  while (cursor < pathData.length) {
    const op = pathData[cursor];
    cursor += 1;

    if (op === DRAW_OPS.moveTo) {
      currentPoint = transformPoint(pathData[cursor], pathData[cursor + 1], transform);
      firstPoint = currentPoint;
      cursor += 2;
      continue;
    }

    if (op === DRAW_OPS.lineTo && currentPoint) {
      const endPoint = transformPoint(pathData[cursor], pathData[cursor + 1], transform);
      const item = createVectorItem({
        pageNumber,
        itemIndex: localIndex,
        type: "line",
        label: "Linha",
        points: [currentPoint, endPoint],
        lineWidth,
      });

      if (item) {
        items.push(item);
        localIndex += 1;
      }

      currentPoint = endPoint;
      cursor += 2;
      continue;
    }

    if (op === DRAW_OPS.curveTo && currentPoint) {
      const points = [
        currentPoint,
        transformPoint(pathData[cursor], pathData[cursor + 1], transform),
        transformPoint(pathData[cursor + 2], pathData[cursor + 3], transform),
        transformPoint(pathData[cursor + 4], pathData[cursor + 5], transform),
      ];
      const item = createVectorItem({
        pageNumber,
        itemIndex: localIndex,
        type: "curve",
        label: "Curva",
        points,
        lineWidth,
      });

      if (item) {
        items.push(item);
        localIndex += 1;
      }

      currentPoint = points[3];
      cursor += 6;
      continue;
    }

    if (op === DRAW_OPS.quadraticCurveTo && currentPoint) {
      const points = [
        currentPoint,
        transformPoint(pathData[cursor], pathData[cursor + 1], transform),
        transformPoint(pathData[cursor + 2], pathData[cursor + 3], transform),
      ];
      const item = createVectorItem({
        pageNumber,
        itemIndex: localIndex,
        type: "curve",
        label: "Curva",
        points,
        lineWidth,
      });

      if (item) {
        items.push(item);
        localIndex += 1;
      }

      currentPoint = points[2];
      cursor += 4;
      continue;
    }

    if (op === DRAW_OPS.closePath) {
      if (currentPoint && firstPoint) {
        const item = createVectorItem({
          pageNumber,
          itemIndex: localIndex,
          type: "line",
          label: "Linha fechada",
          points: [currentPoint, firstPoint],
          lineWidth,
        });

        if (item) {
          items.push(item);
          localIndex += 1;
        }
      }

      currentPoint = firstPoint;
    }
  }

  return items;
}

function getPathData(args) {
  const data = args[1] || args[0] || [];

  if (Array.isArray(data[0])) {
    return data[0];
  }

  return Array.isArray(data) ? data : [];
}

function createGraphicsState() {
  const stack = [];
  const state = {
    currentTransform: [1, 0, 0, 1, 0, 0],
    lineWidth: 1,
    save() {
      stack.push({
        currentTransform: [...this.currentTransform],
        lineWidth: this.lineWidth,
      });
    },
    restore() {
      const restored = stack.pop();

      if (!restored) {
        return;
      }

      this.currentTransform = restored.currentTransform;
      this.lineWidth = restored.lineWidth;
    },
    transform(matrix) {
      this.currentTransform = multiplyMatrices(this.currentTransform, matrix);
    },
  };

  return state;
}

function createVectorItem({
  pageNumber,
  itemIndex,
  type,
  label,
  points,
  lineWidth,
  closed = false,
}) {
  const bounds = calculateBounds(points, lineWidth);

  if (!bounds) {
    return null;
  }

  return {
    id: `pdf-vector-${pageNumber}-${itemIndex}`,
    page: pageNumber,
    type,
    label,
    points,
    bounds,
    lineWidth,
    closed,
  };
}

function calculateBounds(points, lineWidth) {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
  );

  if (!validPoints.length) {
    return null;
  }

  const padding = Math.max(lineWidth / 2, 0.5);
  const xs = validPoints.map((point) => point.x);
  const ys = validPoints.map((point) => point.y);
  const minX = Math.min(...xs) - padding;
  const maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding;
  const maxY = Math.max(...ys) + padding;

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function transformPoint(x, y, matrix) {
  return {
    x: x * matrix[0] + y * matrix[2] + matrix[4],
    y: x * matrix[1] + y * matrix[3] + matrix[5],
  };
}

function multiplyMatrices(first, second) {
  return [
    first[0] * second[0] + first[2] * second[1],
    first[1] * second[0] + first[3] * second[1],
    first[0] * second[2] + first[2] * second[3],
    first[1] * second[2] + first[3] * second[3],
    first[0] * second[4] + first[2] * second[5] + first[4],
    first[1] * second[4] + first[3] * second[5] + first[5],
  ];
}

function rectanglesIntersect(a, b) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}

function area(bounds) {
  return bounds.width * bounds.height;
}
