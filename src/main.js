import DxfParser from "dxf-parser";

/*
|--------------------------------------------------------------------------
| Configurações
|--------------------------------------------------------------------------
*/

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const DXF_FILE = "/planta.dxf";

/*
|--------------------------------------------------------------------------
| Elementos da interface
|--------------------------------------------------------------------------
*/

const loadingElement = document.getElementById("loading");

const errorElement = document.getElementById("error");

const svgElement = document.getElementById("dxf-canvas");

const canvasContainer = document.querySelector(".canvas-container");

const coordinateXElement = document.getElementById("coordinate-x");

const coordinateYElement = document.getElementById("coordinate-y");

const entityPanel = document.getElementById("entity-panel");

const entityPanelCloseButton = document.getElementById("entity-panel-close");

const entityPanelType = document.getElementById("entity-panel-type");

const entityTypeElement = document.getElementById("entity-type");

const entityIdElement = document.getElementById("entity-id");

const entityLayerElement = document.getElementById("entity-layer");

const polylineProperties = document.getElementById("polyline-properties");

const entityVertexCountElement = document.getElementById("entity-vertex-count");

const entityClosedElement = document.getElementById("entity-closed");

const entityPolylineLengthElement = document.getElementById(
  "entity-polyline-length",
);

const segmentProperties = document.getElementById("segment-properties");

const entitySegmentIndexElement = document.getElementById(
  "entity-segment-index",
);

const entitySegmentDistanceElement = document.getElementById(
  "entity-segment-distance",
);

const lineStartSection = document.getElementById("line-start-section");

const lineEndSection = document.getElementById("line-end-section");

const lineMeasureSection = document.getElementById("line-measure-section");

const entityStartXElement = document.getElementById("entity-start-x");

const entityStartYElement = document.getElementById("entity-start-y");

const entityEndXElement = document.getElementById("entity-end-x");

const entityEndYElement = document.getElementById("entity-end-y");

const entityLengthElement = document.getElementById("entity-length");

/*
|--------------------------------------------------------------------------
| Elementos da seleção por área
|--------------------------------------------------------------------------
*/

const selectionPanel = document.getElementById("selection-panel");

const selectionPanelCloseButton = document.getElementById(
  "selection-panel-close",
);

const selectionCountElement = document.getElementById("selection-count");

const selectionListElement = document.getElementById("selection-list");

/*
|--------------------------------------------------------------------------
| Estado do DXF
|--------------------------------------------------------------------------
*/

let currentDxf = null;

/*
|--------------------------------------------------------------------------
| Entidade atualmente selecionada
|--------------------------------------------------------------------------
*/

let selectedEntity = null;

/*
|--------------------------------------------------------------------------
| Elemento SVG da entidade selecionada
|--------------------------------------------------------------------------
*/

let selectedEntityElement = null;

/*
|--------------------------------------------------------------------------
| Segmento atualmente selecionado
|--------------------------------------------------------------------------
*/

let selectedSegment = null;

/*
|--------------------------------------------------------------------------
| Entidades selecionadas por área
|--------------------------------------------------------------------------
|
| Utilizamos Set para impedir IDs duplicados e facilitar operações
| futuras de edição em lote.
|
|--------------------------------------------------------------------------
*/

const selectedEntities = new Set();

/*
|--------------------------------------------------------------------------
| ID da entidade atualmente destacada na lista
|--------------------------------------------------------------------------
*/

let activeSelectionListEntityId = null;

/*
|--------------------------------------------------------------------------
| Pontos criados pelo usuário
|--------------------------------------------------------------------------
*/

let selectedPoints = [];

let nextPointId = 1;

/*
|--------------------------------------------------------------------------
| Estado do ViewBox
|--------------------------------------------------------------------------
*/

let currentViewBox = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

/*
|--------------------------------------------------------------------------
| ViewBox inicial
|--------------------------------------------------------------------------
|
| Mantemos uma cópia do ViewBox original para controlar os limites
| mínimo e máximo do zoom.
|
|--------------------------------------------------------------------------
*/

let initialViewBox = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

/*
|--------------------------------------------------------------------------
| Configurações de zoom
|--------------------------------------------------------------------------
*/

const ZOOM_FACTOR_IN = 0.9;

const ZOOM_FACTOR_OUT = 1.1;

const MIN_ZOOM_VIEWBOX_FACTOR = 0.02;

const MAX_ZOOM_VIEWBOX_FACTOR = 50;

/*
|--------------------------------------------------------------------------
| Configurações de seleção por área
|--------------------------------------------------------------------------
*/

const AREA_SELECTION_MIN_PIXELS = 4;

/*
|--------------------------------------------------------------------------
| Estado da seleção por área
|--------------------------------------------------------------------------
*/

let areaSelectionState = {
  active: false,

  dragging: false,

  startX: 0,

  startY: 0,

  currentX: 0,

  currentY: 0,

  pointerId: null,
};

/*
|--------------------------------------------------------------------------
| Elemento SVG do retângulo de seleção
|--------------------------------------------------------------------------
*/

let selectionRectangleElement = null;

/*
|--------------------------------------------------------------------------
| Estado do pan pelo botão direito
|--------------------------------------------------------------------------
*/

let panState = {
  active: false,

  pointerId: null,

  lastClientX: 0,

  lastClientY: 0,
};

/*
|--------------------------------------------------------------------------
| Estado do clique
|--------------------------------------------------------------------------
|
| Usado para diferenciar clique simples de arrasto.
|
|--------------------------------------------------------------------------
*/

let leftMouseDownState = {
  active: false,

  moved: false,

  pointerId: null,

  startClientX: 0,

  startClientY: 0,
};

/*
|--------------------------------------------------------------------------
| Carregar arquivo DXF
|--------------------------------------------------------------------------
*/

async function loadDxf() {
  const response = await fetch(DXF_FILE);

  if (!response.ok) {
    throw new Error(
      `Não foi possível carregar o arquivo DXF. ` +
        `Status HTTP: ${response.status}`,
    );
  }

  return await response.text();
}

/*
|--------------------------------------------------------------------------
| Converter DXF
|--------------------------------------------------------------------------
*/

function parseDxf(content) {
  const parser = new DxfParser();

  return parser.parseSync(content);
}

/*
|--------------------------------------------------------------------------
| Preparar entidades
|--------------------------------------------------------------------------
*/

function prepareEntities(dxf) {
  dxf.entities.forEach((entity, index) => {
    entity.__id = index;

    entity.__type = entity.type;
  });

  console.log("Entidades preparadas:", dxf.entities.length);
}

/*
|--------------------------------------------------------------------------
| Analisar entidades
|--------------------------------------------------------------------------
*/

function analyzeEntities(dxf) {
  const types = {};

  for (const entity of dxf.entities) {
    if (!types[entity.type]) {
      types[entity.type] = 0;
    }

    types[entity.type]++;
  }

  console.log("Distribuição das entidades:");

  console.table(types);

  return types;
}

/*
|--------------------------------------------------------------------------
| Calcular limites
|--------------------------------------------------------------------------
*/

function calculateBounds(dxf) {
  let minX = Infinity;

  let maxX = -Infinity;

  let minY = Infinity;

  let maxY = -Infinity;

  function updatePoint(x, y) {
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return;
    }

    minX = Math.min(minX, x);

    maxX = Math.max(maxX, x);

    minY = Math.min(minY, y);

    maxY = Math.max(maxY, y);
  }

  for (const entity of dxf.entities) {
    if (Array.isArray(entity.vertices)) {
      for (const vertex of entity.vertices) {
        updatePoint(vertex.x, vertex.y);
      }
    }

    if (entity.center) {
      updatePoint(entity.center.x, entity.center.y);
    }

    if (entity.position) {
      updatePoint(entity.position.x, entity.position.y);
    }

    if (entity.startPoint) {
      updatePoint(entity.startPoint.x, entity.startPoint.y);
    }

    if (entity.endPoint) {
      updatePoint(entity.endPoint.x, entity.endPoint.y);
    }
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY)
  ) {
    throw new Error("Não foi possível determinar os limites da planta.");
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
  };
}

/*
|--------------------------------------------------------------------------
| Criar elemento SVG
|--------------------------------------------------------------------------
*/

function createSvgElement(type) {
  return document.createElementNS(SVG_NAMESPACE, type);
}

/*
|--------------------------------------------------------------------------
| Aplicar metadados
|--------------------------------------------------------------------------
*/

function applyEntityMetadata(element, entity) {
  element.dataset.entityId = entity.__id;

  element.dataset.entityType = entity.type;

  if (entity.layer) {
    element.dataset.layer = entity.layer;
  }
}

/*
|--------------------------------------------------------------------------
| Criar LINE
|--------------------------------------------------------------------------
*/

function createSvgLine(entity) {
  if (!entity.vertices || entity.vertices.length < 2) {
    return null;
  }

  const start = entity.vertices[0];

  const end = entity.vertices[1];

  const line = createSvgElement("line");

  line.setAttribute("x1", start.x);

  line.setAttribute("x2", end.x);

  line.setAttribute("y1", -start.y);

  line.setAttribute("y2", -end.y);

  line.classList.add("dxf-entity");

  applyEntityMetadata(line, entity);

  return line;
}

/*
|--------------------------------------------------------------------------
| Criar LWPOLYLINE
|--------------------------------------------------------------------------
*/

function createSvgPolyline(entity) {
  if (!entity.vertices || entity.vertices.length < 2) {
    return null;
  }

  const polyline = createSvgElement("polyline");

  const points = entity.vertices
    .map((vertex) => `${vertex.x},${-vertex.y}`)
    .join(" ");

  polyline.setAttribute("points", points);

  polyline.classList.add("dxf-entity");

  applyEntityMetadata(polyline, entity);

  polyline.dataset.vertexCount = entity.vertices.length;

  if (entity.shape === true || entity.closed === true) {
    polyline.setAttribute("data-closed", "true");
  }

  return polyline;
}

/*
|--------------------------------------------------------------------------
| Criar CIRCLE
|--------------------------------------------------------------------------
*/

function createSvgCircle(entity) {
  if (!entity.center || typeof entity.radius !== "number") {
    return null;
  }

  const circle = createSvgElement("circle");

  circle.setAttribute("cx", entity.center.x);

  circle.setAttribute("cy", -entity.center.y);

  circle.setAttribute("r", entity.radius);

  circle.classList.add("dxf-entity");

  applyEntityMetadata(circle, entity);

  circle.dataset.radius = entity.radius;

  return circle;
}

/*
|--------------------------------------------------------------------------
| Graus → Radianos
|--------------------------------------------------------------------------
*/

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/*
|--------------------------------------------------------------------------
| Criar ARC
|--------------------------------------------------------------------------
*/

function createSvgArc(entity) {
  if (
    !entity.center ||
    typeof entity.radius !== "number" ||
    typeof entity.startAngle !== "number" ||
    typeof entity.endAngle !== "number"
  ) {
    return null;
  }

  const centerX = entity.center.x;

  const centerY = entity.center.y;

  const radius = entity.radius;

  let startAngle = entity.startAngle;

  let endAngle = entity.endAngle;

  while (startAngle < 0) {
    startAngle += 360;
  }

  while (endAngle < 0) {
    endAngle += 360;
  }

  let angleDifference = endAngle - startAngle;

  if (angleDifference < 0) {
    angleDifference += 360;
  }

  const startRadians = degreesToRadians(startAngle);

  const endRadians = degreesToRadians(endAngle);

  const startX = centerX + radius * Math.cos(startRadians);

  const startY = centerY + radius * Math.sin(startRadians);

  const endX = centerX + radius * Math.cos(endRadians);

  const endY = centerY + radius * Math.sin(endRadians);

  const svgStartY = -startY;

  const svgEndY = -endY;

  const largeArcFlag = angleDifference > 180 ? 1 : 0;

  const sweepFlag = 0;

  const path = createSvgElement("path");

  const pathData =
    `M ${startX} ${svgStartY} ` +
    `A ${radius} ${radius} 0 ` +
    `${largeArcFlag} ${sweepFlag} ` +
    `${endX} ${svgEndY}`;

  path.setAttribute("d", pathData);

  path.classList.add("dxf-entity");

  applyEntityMetadata(path, entity);

  path.dataset.startAngle = startAngle;

  path.dataset.endAngle = endAngle;

  return path;
}

/*
|--------------------------------------------------------------------------
| Texto
|--------------------------------------------------------------------------
*/

function getTextValue(entity) {
  return entity.text ?? entity.string ?? entity.value ?? "";
}

/*
|--------------------------------------------------------------------------
| Criar TEXT
|--------------------------------------------------------------------------
*/

function createSvgText(entity) {
  const textValue = getTextValue(entity);

  if (!textValue) {
    return null;
  }

  const position = entity.startPoint ?? entity.position ?? entity.point;

  if (!position) {
    return null;
  }

  const text = createSvgElement("text");

  text.textContent = textValue;

  text.setAttribute("x", position.x);

  text.setAttribute("y", -position.y);

  if (typeof entity.textHeight === "number") {
    text.setAttribute("font-size", entity.textHeight);
  } else if (typeof entity.height === "number") {
    text.setAttribute("font-size", entity.height);
  }

  const rotation = typeof entity.rotation === "number" ? entity.rotation : 0;

  if (rotation !== 0) {
    text.setAttribute(
      "transform",
      `rotate(${-rotation} ` + `${position.x} ` + `${-position.y})`,
    );
  }

  text.setAttribute("dominant-baseline", "alphabetic");

  text.classList.add("dxf-text");

  applyEntityMetadata(text, entity);

  text.dataset.text = textValue;

  return text;
}

/*
|--------------------------------------------------------------------------
| Criar MTEXT
|--------------------------------------------------------------------------
*/

function createSvgMText(entity) {
  const textValue = getTextValue(entity);

  if (!textValue) {
    return null;
  }

  const position = entity.position ?? entity.startPoint ?? entity.point;

  if (!position) {
    return null;
  }

  const text = createSvgElement("text");

  const cleanText = textValue
    .replace(/\\P/g, "\n")
    .replace(/\\[A-Za-z][^;]*;/g, "");

  text.textContent = cleanText;

  text.setAttribute("x", position.x);

  text.setAttribute("y", -position.y);

  if (typeof entity.height === "number") {
    text.setAttribute("font-size", entity.height);
  }

  const rotation = typeof entity.rotation === "number" ? entity.rotation : 0;

  if (rotation !== 0) {
    text.setAttribute(
      "transform",
      `rotate(${-rotation} ` + `${position.x} ` + `${-position.y})`,
    );
  }

  text.classList.add("dxf-text");

  applyEntityMetadata(text, entity);

  text.dataset.text = cleanText;

  return text;
}

/*
|--------------------------------------------------------------------------
| Configurar ViewBox
|--------------------------------------------------------------------------
*/

function configureSvg(bounds) {
  const width = bounds.maxX - bounds.minX;

  const height = bounds.maxY - bounds.minY;

  const padding = Math.max(width, height) * 0.05;

  const x = bounds.minX - padding;

  const y = -(bounds.maxY + padding);

  const viewBoxWidth = width + padding * 2;

  const viewBoxHeight = height + padding * 2;

  currentViewBox = {
    x,
    y,
    width: viewBoxWidth,
    height: viewBoxHeight,
  };

  initialViewBox = {
    x,
    y,
    width: viewBoxWidth,
    height: viewBoxHeight,
  };

  svgElement.setAttribute(
    "viewBox",
    `${x} ${y} ` + `${viewBoxWidth} ` + `${viewBoxHeight}`,
  );

  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

  console.log("ViewBox configurado:", currentViewBox);
}

/*
|--------------------------------------------------------------------------
| Aplicar ViewBox atual ao SVG
|--------------------------------------------------------------------------
*/

function applyCurrentViewBox() {
  svgElement.setAttribute(
    "viewBox",
    `${currentViewBox.x} ${currentViewBox.y} ` +
      `${currentViewBox.width} ${currentViewBox.height}`,
  );
}

/*
|--------------------------------------------------------------------------
| Obter coordenada SVG real do cursor
|--------------------------------------------------------------------------
*/

function screenToRawSvgCoordinates(event) {
  const screenCTM = svgElement.getScreenCTM();

  if (!screenCTM) {
    return null;
  }

  const point = svgElement.createSVGPoint();

  point.x = event.clientX;

  point.y = event.clientY;

  return point.matrixTransform(screenCTM.inverse());
}

/*
|--------------------------------------------------------------------------
| Calcular limites do zoom
|--------------------------------------------------------------------------
*/

function getZoomLimits() {
  const minWidth = initialViewBox.width * MIN_ZOOM_VIEWBOX_FACTOR;

  const minHeight = initialViewBox.height * MIN_ZOOM_VIEWBOX_FACTOR;

  const maxWidth = initialViewBox.width * MAX_ZOOM_VIEWBOX_FACTOR;

  const maxHeight = initialViewBox.height * MAX_ZOOM_VIEWBOX_FACTOR;

  return {
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  };
}

/*
|--------------------------------------------------------------------------
| Aplicar zoom
|--------------------------------------------------------------------------
|
| O zoom acontece exatamente em torno da posição do mouse.
|
|--------------------------------------------------------------------------
*/

function zoomAtPoint(event, zoomFactor) {
  if (
    !Number.isFinite(zoomFactor) ||
    zoomFactor <= 0 ||
    !svgElement.getScreenCTM()
  ) {
    return;
  }

  const cursorPoint = screenToRawSvgCoordinates(event);

  if (!cursorPoint) {
    return;
  }

  const limits = getZoomLimits();

  let newWidth = currentViewBox.width * zoomFactor;

  let newHeight = currentViewBox.height * zoomFactor;

  newWidth = Math.max(limits.minWidth, Math.min(limits.maxWidth, newWidth));

  newHeight = Math.max(limits.minHeight, Math.min(limits.maxHeight, newHeight));

  const realFactorX = newWidth / currentViewBox.width;

  const realFactorY = newHeight / currentViewBox.height;

  const relativeX = (cursorPoint.x - currentViewBox.x) / currentViewBox.width;

  const relativeY = (cursorPoint.y - currentViewBox.y) / currentViewBox.height;

  const newX = cursorPoint.x - relativeX * newWidth;

  const newY = cursorPoint.y - relativeY * newHeight;

  currentViewBox = {
    x: newX,
    y: newY,
    width: newWidth,
    height: newHeight,
  };

  applyCurrentViewBox();

  console.log("Zoom aplicado:", {
    fator: zoomFactor,

    fatorRealX: realFactorX,

    fatorRealY: realFactorY,

    viewBox: {
      x: currentViewBox.x,

      y: currentViewBox.y,

      width: currentViewBox.width,

      height: currentViewBox.height,
    },
  });
}

/*
|--------------------------------------------------------------------------
| Zoom in
|--------------------------------------------------------------------------
*/

function zoomIn(event) {
  zoomAtPoint(event, ZOOM_FACTOR_IN);
}

/*
|--------------------------------------------------------------------------
| Zoom out
|--------------------------------------------------------------------------
*/

function zoomOut(event) {
  zoomAtPoint(event, ZOOM_FACTOR_OUT);
}

/*
|--------------------------------------------------------------------------
| Criar fundo
|--------------------------------------------------------------------------
*/

function createBackground(bounds) {
  const width = bounds.maxX - bounds.minX;

  const height = bounds.maxY - bounds.minY;

  const background = createSvgElement("rect");

  background.setAttribute("x", bounds.minX);

  background.setAttribute("y", -bounds.maxY);

  background.setAttribute("width", width);

  background.setAttribute("height", height);

  background.classList.add("drawing-background");

  return background;
}

/*
|--------------------------------------------------------------------------
| Renderizar LINE
|--------------------------------------------------------------------------
*/

function renderLines(dxf) {
  let renderedLines = 0;

  for (const entity of dxf.entities) {
    if (entity.type !== "LINE") {
      continue;
    }

    const element = createSvgLine(entity);

    if (!element) {
      continue;
    }

    svgElement.appendChild(element);

    renderedLines++;
  }

  console.log("Linhas renderizadas:", renderedLines);
}

/*
|--------------------------------------------------------------------------
| Renderizar LWPOLYLINE
|--------------------------------------------------------------------------
*/

function renderPolylines(dxf) {
  let renderedPolylines = 0;

  let totalVertices = 0;

  for (const entity of dxf.entities) {
    if (entity.type !== "LWPOLYLINE") {
      continue;
    }

    const element = createSvgPolyline(entity);

    if (!element) {
      continue;
    }

    svgElement.appendChild(element);

    renderedPolylines++;

    totalVertices += entity.vertices.length;
  }

  console.log("LWPOLYLINE renderizadas:", renderedPolylines);

  console.log("Vértices de LWPOLYLINE renderizados:", totalVertices);
}

/*
|--------------------------------------------------------------------------
| Renderizar CIRCLE
|--------------------------------------------------------------------------
*/

function renderCircles(dxf) {
  let renderedCircles = 0;

  for (const entity of dxf.entities) {
    if (entity.type !== "CIRCLE") {
      continue;
    }

    const element = createSvgCircle(entity);

    if (!element) {
      continue;
    }

    svgElement.appendChild(element);

    renderedCircles++;
  }

  console.log("CIRCLE renderizados:", renderedCircles);
}

/*
|--------------------------------------------------------------------------
| Renderizar ARC
|--------------------------------------------------------------------------
*/

function renderArcs(dxf) {
  let renderedArcs = 0;

  for (const entity of dxf.entities) {
    if (entity.type !== "ARC") {
      continue;
    }

    const element = createSvgArc(entity);

    if (!element) {
      continue;
    }

    svgElement.appendChild(element);

    renderedArcs++;
  }

  console.log("ARC renderizados:", renderedArcs);
}

/*
|--------------------------------------------------------------------------
| Renderizar TEXT
|--------------------------------------------------------------------------
*/

function renderTexts(dxf) {
  let renderedTexts = 0;

  for (const entity of dxf.entities) {
    if (entity.type !== "TEXT") {
      continue;
    }

    const element = createSvgText(entity);

    if (!element) {
      continue;
    }

    svgElement.appendChild(element);

    renderedTexts++;
  }

  console.log("TEXT renderizados:", renderedTexts);
}

/*
|--------------------------------------------------------------------------
| Renderizar MTEXT
|--------------------------------------------------------------------------
*/

function renderMTexts(dxf) {
  let renderedMTexts = 0;

  for (const entity of dxf.entities) {
    if (entity.type !== "MTEXT") {
      continue;
    }

    const element = createSvgMText(entity);

    if (!element) {
      continue;
    }

    svgElement.appendChild(element);

    renderedMTexts++;
  }

  console.log("MTEXT renderizados:", renderedMTexts);
}

/*
|--------------------------------------------------------------------------
| Marcador central
|--------------------------------------------------------------------------
*/

function createBoundsMarker(bounds) {
  const centerX = (bounds.minX + bounds.maxX) / 2;

  const centerY = (bounds.minY + bounds.maxY) / 2;

  const circle = createSvgElement("circle");

  const radius =
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.01;

  circle.setAttribute("cx", centerX);

  circle.setAttribute("cy", -centerY);

  circle.setAttribute("r", radius);

  circle.classList.add("debug-center");

  svgElement.appendChild(circle);

  console.log("Centro do desenho:", {
    x: centerX,

    y: centerY,
  });
}

/*
|--------------------------------------------------------------------------
| Converter mouse → coordenada DXF
|--------------------------------------------------------------------------
*/

function screenToSvgCoordinates(event) {
  const point = svgElement.createSVGPoint();

  point.x = event.clientX;

  point.y = event.clientY;

  const screenCTM = svgElement.getScreenCTM();

  if (!screenCTM) {
    return {
      x: 0,

      y: 0,
    };
  }

  const svgPoint = point.matrixTransform(screenCTM.inverse());

  return {
    x: svgPoint.x,

    /*
      |--------------------------------------------------------------------------
      | O SVG está invertido verticalmente
      |--------------------------------------------------------------------------
      */

    y: -svgPoint.y,
  };
}

/*
|--------------------------------------------------------------------------
| Criar marcador de ponto
|--------------------------------------------------------------------------
*/

function createPointMarker(point) {
  const group = createSvgElement("g");

  group.classList.add("user-point");

  group.dataset.pointId = point.id;

  const svgX = point.x;

  const svgY = -point.y;

  const radius = Math.max(currentViewBox.width, currentViewBox.height) * 0.006;

  const circle = createSvgElement("circle");

  circle.setAttribute("cx", svgX);

  circle.setAttribute("cy", svgY);

  circle.setAttribute("r", radius);

  circle.setAttribute("fill", "#ff3333");

  circle.setAttribute("stroke", "#ffffff");

  circle.setAttribute("stroke-width", "2");

  circle.setAttribute("vector-effect", "non-scaling-stroke");

  const text = createSvgElement("text");

  text.textContent = `P${point.id}`;

  text.setAttribute("x", svgX + radius * 1.5);

  text.setAttribute("y", svgY - radius * 1.5);

  text.setAttribute("fill", "#ff3333");

  text.setAttribute("font-size", radius * 3);

  text.setAttribute("font-family", "Arial, sans-serif");

  text.setAttribute("font-weight", "bold");

  text.setAttribute("pointer-events", "none");

  group.appendChild(circle);

  group.appendChild(text);

  return group;
}

/*
|--------------------------------------------------------------------------
| Criar ponto do usuário
|--------------------------------------------------------------------------
*/

function createUserPoint(coordinates) {
  const point = {
    id: nextPointId++,

    type: "POINT",

    x: coordinates.x,

    y: coordinates.y,
  };

  selectedPoints.push(point);

  console.log("Novo ponto criado:", point);

  return point;
}

/*
|--------------------------------------------------------------------------
| Renderizar ponto criado pelo usuário
|--------------------------------------------------------------------------
*/

function renderUserPoint(point) {
  const marker = createPointMarker(point);

  svgElement.appendChild(marker);
}

/*
|--------------------------------------------------------------------------
| Atualizar coordenadas
|--------------------------------------------------------------------------
*/

function updateMouseCoordinates(event) {
  if (!svgElement.getScreenCTM()) {
    return;
  }

  const coordinates = screenToSvgCoordinates(event);

  coordinateXElement.textContent = coordinates.x.toFixed(3);

  coordinateYElement.textContent = coordinates.y.toFixed(3);
}

/*
|--------------------------------------------------------------------------
| Obter pontos inicial e final da LINE
|--------------------------------------------------------------------------
*/

function getLineEndpoints(entity) {
  if (!entity || entity.type !== "LINE") {
    return null;
  }

  if (!Array.isArray(entity.vertices) || entity.vertices.length < 2) {
    return null;
  }

  const start = entity.vertices[0];

  const end = entity.vertices[1];

  if (
    !start ||
    !end ||
    typeof start.x !== "number" ||
    typeof start.y !== "number" ||
    typeof end.x !== "number" ||
    typeof end.y !== "number"
  ) {
    return null;
  }

  return {
    start,
    end,
  };
}

/*
|--------------------------------------------------------------------------
| Verificar vértice válido
|--------------------------------------------------------------------------
*/

function isValidVertex(vertex) {
  return (
    vertex &&
    typeof vertex.x === "number" &&
    typeof vertex.y === "number" &&
    Number.isFinite(vertex.x) &&
    Number.isFinite(vertex.y)
  );
}

/*
|--------------------------------------------------------------------------
| Obter segmentos da LWPOLYLINE
|--------------------------------------------------------------------------
*/

function getPolylineSegments(entity) {
  if (
    !entity ||
    entity.type !== "LWPOLYLINE" ||
    !Array.isArray(entity.vertices) ||
    entity.vertices.length < 2
  ) {
    return [];
  }

  const segments = [];

  for (let index = 0; index < entity.vertices.length - 1; index++) {
    const start = entity.vertices[index];

    const end = entity.vertices[index + 1];

    if (!isValidVertex(start) || !isValidVertex(end)) {
      continue;
    }

    segments.push({
      start,

      end,

      startIndex: index,

      endIndex: index + 1,
    });
  }

  const isClosed = entity.shape === true || entity.closed === true;

  if (isClosed && entity.vertices.length >= 3) {
    const start = entity.vertices[entity.vertices.length - 1];

    const end = entity.vertices[0];

    if (isValidVertex(start) && isValidVertex(end)) {
      segments.push({
        start,

        end,

        startIndex: entity.vertices.length - 1,

        endIndex: 0,
      });
    }
  }

  return segments;
}

/*
|--------------------------------------------------------------------------
| Distância entre ponto e segmento
|--------------------------------------------------------------------------
*/

function calculatePointToSegmentDistance(point, start, end) {
  const segmentX = end.x - start.x;

  const segmentY = end.y - start.y;

  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  /*
    |--------------------------------------------------------------------------
    | Segmento degenerado
    |--------------------------------------------------------------------------
    */

  if (segmentLengthSquared === 0) {
    const deltaX = point.x - start.x;

    const deltaY = point.y - start.y;

    return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  let projection =
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
    segmentLengthSquared;

  projection = Math.max(0, Math.min(1, projection));

  const closestX = start.x + projection * segmentX;

  const closestY = start.y + projection * segmentY;

  const deltaX = point.x - closestX;

  const deltaY = point.y - closestY;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/*
|--------------------------------------------------------------------------
| Tolerância de seleção
|--------------------------------------------------------------------------
*/

function getLineSelectionTolerance() {
  const canvasWidth = svgElement.clientWidth;

  const canvasHeight = svgElement.clientHeight;

  if (
    !canvasWidth ||
    !canvasHeight ||
    !Number.isFinite(currentViewBox.width) ||
    !Number.isFinite(currentViewBox.height)
  ) {
    return 5;
  }

  const pixels = 10;

  const unitsPerPixelX = currentViewBox.width / canvasWidth;

  const unitsPerPixelY = currentViewBox.height / canvasHeight;

  const unitsPerPixel = Math.max(unitsPerPixelX, unitsPerPixelY);

  return pixels * unitsPerPixel;
}

/*
|--------------------------------------------------------------------------
| Encontrar LINE mais próxima
|--------------------------------------------------------------------------
*/

function findNearestLine(coordinates) {
  if (!currentDxf || !Array.isArray(currentDxf.entities)) {
    return null;
  }

  const tolerance = getLineSelectionTolerance();

  let nearestLine = null;

  let nearestDistance = Infinity;

  for (const entity of currentDxf.entities) {
    if (entity.type !== "LINE") {
      continue;
    }

    const endpoints = getLineEndpoints(entity);

    if (!endpoints) {
      continue;
    }

    const distance = calculatePointToSegmentDistance(
      coordinates,
      endpoints.start,
      endpoints.end,
    );

    if (distance > tolerance) {
      continue;
    }

    if (distance < nearestDistance) {
      nearestDistance = distance;

      nearestLine = entity;
    }
  }

  if (nearestLine) {
    console.log("LINE encontrada próxima ao clique:", {
      id: nearestLine.__id,

      layer: nearestLine.layer ?? "0",

      distance: nearestDistance,

      tolerance,
    });
  }

  return nearestLine;
}

/*
|--------------------------------------------------------------------------
| Encontrar LWPOLYLINE mais próxima
|--------------------------------------------------------------------------
*/

function findNearestPolyline(coordinates) {
  if (!currentDxf || !Array.isArray(currentDxf.entities)) {
    return null;
  }

  const tolerance = getLineSelectionTolerance();

  let nearestPolyline = null;

  let nearestDistance = Infinity;

  let nearestSegment = null;

  for (const entity of currentDxf.entities) {
    if (entity.type !== "LWPOLYLINE") {
      continue;
    }

    const segments = getPolylineSegments(entity);

    for (const segment of segments) {
      const distance = calculatePointToSegmentDistance(
        coordinates,
        segment.start,
        segment.end,
      );

      if (distance > tolerance) {
        continue;
      }

      if (distance < nearestDistance) {
        nearestDistance = distance;

        nearestPolyline = entity;

        nearestSegment = segment;
      }
    }
  }

  if (nearestPolyline) {
    console.log("LWPOLYLINE encontrada próxima ao clique:", {
      id: nearestPolyline.__id,

      layer: nearestPolyline.layer ?? "0",

      distance: nearestDistance,

      tolerance,

      segment: {
        startIndex: nearestSegment.startIndex,

        endIndex: nearestSegment.endIndex,
      },
    });
  }

  return nearestPolyline
    ? {
        entity: nearestPolyline,

        distance: nearestDistance,

        segment: nearestSegment,
      }
    : null;
}

/*
|--------------------------------------------------------------------------
| Encontrar entidade SVG
|--------------------------------------------------------------------------
*/

function findSvgElementByEntity(entity) {
  if (!entity) {
    return null;
  }

  return svgElement.querySelector(`[data-entity-id="${entity.__id}"]`);
}

/*
|--------------------------------------------------------------------------
| Calcular comprimento da LINE
|--------------------------------------------------------------------------
*/

function calculateLineLength(entity) {
  const endpoints = getLineEndpoints(entity);

  if (!endpoints) {
    return null;
  }

  const deltaX = endpoints.end.x - endpoints.start.x;

  const deltaY = endpoints.end.y - endpoints.start.y;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

/*
|--------------------------------------------------------------------------
| Calcular comprimento da LWPOLYLINE
|--------------------------------------------------------------------------
*/

function calculatePolylineLength(entity) {
  const segments = getPolylineSegments(entity);

  let totalLength = 0;

  for (const segment of segments) {
    const deltaX = segment.end.x - segment.start.x;

    const deltaY = segment.end.y - segment.start.y;

    totalLength += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  }

  return totalLength;
}

/*
|--------------------------------------------------------------------------
| Verificar se LWPOLYLINE está fechada
|--------------------------------------------------------------------------
*/

function isPolylineClosed(entity) {
  return entity.shape === true || entity.closed === true;
}

/*
|--------------------------------------------------------------------------
| Formatar número
|--------------------------------------------------------------------------
*/

function formatEntityNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return value.toFixed(3);
}

/*
|--------------------------------------------------------------------------
| Atualizar painel de propriedades
|--------------------------------------------------------------------------
*/

function updateEntityPanel(entity, selectionData = null) {
  if (!entity) {
    entityPanel.classList.add("hidden");

    return;
  }

  entityPanelType.textContent = entity.type;

  entityTypeElement.textContent = entity.type;

  entityIdElement.textContent = entity.__id;

  entityLayerElement.textContent = entity.layer ?? "0";

  polylineProperties.classList.add("hidden");

  segmentProperties.classList.add("hidden");

  lineStartSection.classList.add("hidden");

  lineEndSection.classList.add("hidden");

  lineMeasureSection.classList.add("hidden");

  if (entity.type === "LINE") {
    const endpoints = getLineEndpoints(entity);

    const length = calculateLineLength(entity);

    if (endpoints) {
      entityStartXElement.textContent = formatEntityNumber(endpoints.start.x);

      entityStartYElement.textContent = formatEntityNumber(endpoints.start.y);

      entityEndXElement.textContent = formatEntityNumber(endpoints.end.x);

      entityEndYElement.textContent = formatEntityNumber(endpoints.end.y);
    }

    entityLengthElement.textContent = formatEntityNumber(length);

    lineStartSection.classList.remove("hidden");

    lineEndSection.classList.remove("hidden");

    lineMeasureSection.classList.remove("hidden");
  }

  if (entity.type === "LWPOLYLINE") {
    const vertexCount = Array.isArray(entity.vertices)
      ? entity.vertices.length
      : 0;

    const closed = isPolylineClosed(entity);

    const length = calculatePolylineLength(entity);

    entityVertexCountElement.textContent = vertexCount;

    entityClosedElement.textContent = closed ? "Sim" : "Não";

    entityPolylineLengthElement.textContent = formatEntityNumber(length);

    polylineProperties.classList.remove("hidden");

    if (selectionData && selectionData.segment) {
      const segment = selectionData.segment;

      entitySegmentIndexElement.textContent = `${segment.startIndex} → ${segment.endIndex}`;

      entitySegmentDistanceElement.textContent = formatEntityNumber(
        selectionData.distance,
      );

      segmentProperties.classList.remove("hidden");
    }
  }

  entityPanel.classList.remove("hidden");
}

/*
|--------------------------------------------------------------------------
| Limpar seleção visual individual
|--------------------------------------------------------------------------
*/

function clearEntitySelectionVisual() {
  if (selectedEntityElement) {
    selectedEntityElement.classList.remove("entity-selected");
  }

  selectedEntityElement = null;
}

/*
|--------------------------------------------------------------------------
| Aplicar seleção visual das entidades selecionadas
|--------------------------------------------------------------------------
*/

function refreshAreaSelectionVisuals() {
  const entityElements = svgElement.querySelectorAll(".dxf-entity");

  entityElements.forEach((element) => {
    const entityId = Number(element.dataset.entityId);

    if (selectedEntities.has(entityId)) {
      element.classList.add("area-selected");
    } else {
      element.classList.remove("area-selected");
    }
  });
}

/*
|--------------------------------------------------------------------------
| Atualizar lista de entidades selecionadas
|--------------------------------------------------------------------------
*/

function updateSelectionPanel() {
  selectionListElement.innerHTML = "";

  const entities = Array.from(selectedEntities)
    .map((entityId) =>
      currentDxf?.entities?.find((entity) => entity.__id === entityId),
    )
    .filter(Boolean)
    .sort((a, b) => a.__id - b.__id);

  selectionCountElement.textContent = entities.length;

  if (entities.length === 0) {
    selectionListElement.innerHTML =
      '<div class="selection-empty">Nenhuma entidade selecionada.</div>';

    selectionPanel.classList.add("hidden");

    return;
  }

  selectionPanel.classList.remove("hidden");

  for (const entity of entities) {
    const item = document.createElement("button");

    item.type = "button";

    item.className = "selection-item";

    if (entity.__id === activeSelectionListEntityId) {
      item.classList.add("active");
    }

    item.dataset.entityId = entity.__id;

    const main = document.createElement("div");

    main.className = "selection-item-main";

    const type = document.createElement("span");

    type.className = "selection-item-type";

    type.textContent = entity.type;

    const id = document.createElement("span");

    id.className = "selection-item-id";

    id.textContent = `ID ${entity.__id}`;

    const layer = document.createElement("div");

    layer.className = "selection-item-layer";

    layer.textContent = `Layer: ${entity.layer ?? "0"}`;

    main.appendChild(type);

    main.appendChild(id);

    item.appendChild(main);

    item.appendChild(layer);

    item.addEventListener("click", (event) => {
      event.stopPropagation();

      const selected = currentDxf?.entities?.find(
        (candidate) => candidate.__id === entity.__id,
      );

      if (!selected) {
        return;
      }

      activeSelectionListEntityId = selected.__id;

      const svgElementForEntity = findSvgElementByEntity(selected);

      if (selectedEntityElement) {
        selectedEntityElement.classList.remove("entity-selected");
      }

      selectedEntity = selected;

      selectedSegment = null;

      selectedEntityElement = svgElementForEntity;

      if (selectedEntityElement) {
        selectedEntityElement.classList.add("entity-selected");

        selectedEntityElement.classList.add("area-selected");
      }

      updateEntityPanel(selected);

      updateSelectionPanel();

      console.log("Entidade da seleção por área aberta:", {
        id: selected.__id,

        type: selected.type,

        layer: selected.layer ?? "0",
      });
    });

    selectionListElement.appendChild(item);
  }
}

/*
|--------------------------------------------------------------------------
| Limpar seleção por área
|--------------------------------------------------------------------------
*/

function clearAreaSelection(options = {}) {
  const { hidePanel = true, log = true } = options;

  selectedEntities.clear();

  activeSelectionListEntityId = null;

  refreshAreaSelectionVisuals();

  if (hidePanel) {
    selectionPanel.classList.add("hidden");
  }

  updateSelectionPanel();

  if (log) {
    console.log("Seleção por área removida.");
  }
}

/*
|--------------------------------------------------------------------------
| Selecionar entidades por área
|--------------------------------------------------------------------------
*/

function selectEntitiesInArea(selectionBounds) {
  if (!currentDxf || !Array.isArray(currentDxf.entities)) {
    return;
  }

  selectedEntities.clear();

  activeSelectionListEntityId = null;

  const entityElements = svgElement.querySelectorAll(".dxf-entity");

  for (const element of entityElements) {
    const entityId = Number(element.dataset.entityId);

    if (!Number.isFinite(entityId)) {
      continue;
    }

    let boundingBox = null;

    try {
      boundingBox = element.getBBox();
    } catch (error) {
      console.warn(
        "Não foi possível calcular o limite SVG da entidade:",
        entityId,
        error,
      );

      continue;
    }

    if (
      !boundingBox ||
      !Number.isFinite(boundingBox.x) ||
      !Number.isFinite(boundingBox.y) ||
      !Number.isFinite(boundingBox.width) ||
      !Number.isFinite(boundingBox.height)
    ) {
      continue;
    }

    const entityMinX = boundingBox.x;

    const entityMaxX = boundingBox.x + boundingBox.width;

    const entityMinY = boundingBox.y;

    const entityMaxY = boundingBox.y + boundingBox.height;

    const isInside =
      entityMinX >= selectionBounds.minX &&
      entityMaxX <= selectionBounds.maxX &&
      entityMinY >= selectionBounds.minY &&
      entityMaxY <= selectionBounds.maxY;

    if (isInside) {
      selectedEntities.add(entityId);
    }
  }

  refreshAreaSelectionVisuals();

  updateSelectionPanel();

  console.log("======================================");

  console.log("SELEÇÃO POR ÁREA FINALIZADA");

  console.log("Área:", {
    minX: selectionBounds.minX,

    maxX: selectionBounds.maxX,

    minY: selectionBounds.minY,

    maxY: selectionBounds.maxY,
  });

  console.log("Quantidade de entidades selecionadas:", selectedEntities.size);

  console.log("IDs selecionados:", Array.from(selectedEntities));

  console.log(
    "Entidades selecionadas:",
    Array.from(selectedEntities)
      .map((id) => currentDxf.entities.find((entity) => entity.__id === id))
      .filter(Boolean),
  );

  console.log("======================================");
}

/*
|--------------------------------------------------------------------------
| Criar retângulo de seleção
|--------------------------------------------------------------------------
*/

function createSelectionRectangle() {
  if (selectionRectangleElement) {
    return selectionRectangleElement;
  }

  selectionRectangleElement = createSvgElement("rect");

  selectionRectangleElement.classList.add("selection-rectangle");

  selectionRectangleElement.setAttribute("x", 0);

  selectionRectangleElement.setAttribute("y", 0);

  selectionRectangleElement.setAttribute("width", 0);

  selectionRectangleElement.setAttribute("height", 0);

  svgElement.appendChild(selectionRectangleElement);

  return selectionRectangleElement;
}

/*
|--------------------------------------------------------------------------
| Atualizar retângulo de seleção
|--------------------------------------------------------------------------
*/

function updateSelectionRectangle() {
  if (!selectionRectangleElement) {
    return;
  }

  const startPoint = screenToRawSvgCoordinates({
    clientX: areaSelectionState.startX,

    clientY: areaSelectionState.startY,
  });

  const currentPoint = screenToRawSvgCoordinates({
    clientX: areaSelectionState.currentX,

    clientY: areaSelectionState.currentY,
  });

  if (!startPoint || !currentPoint) {
    return;
  }

  const minX = Math.min(startPoint.x, currentPoint.x);

  const maxX = Math.max(startPoint.x, currentPoint.x);

  const minY = Math.min(startPoint.y, currentPoint.y);

  const maxY = Math.max(startPoint.y, currentPoint.y);

  selectionRectangleElement.setAttribute("x", minX);

  selectionRectangleElement.setAttribute("y", minY);

  selectionRectangleElement.setAttribute("width", maxX - minX);

  selectionRectangleElement.setAttribute("height", maxY - minY);
}

/*
|--------------------------------------------------------------------------
| Remover retângulo de seleção
|--------------------------------------------------------------------------
*/

function removeSelectionRectangle() {
  if (!selectionRectangleElement) {
    return;
  }

  selectionRectangleElement.remove();

  selectionRectangleElement = null;
}

/*
|--------------------------------------------------------------------------
| Obter limites da seleção por área
|--------------------------------------------------------------------------
*/

function getAreaSelectionBounds() {
  const startPoint = screenToRawSvgCoordinates({
    clientX: areaSelectionState.startX,

    clientY: areaSelectionState.startY,
  });

  const currentPoint = screenToRawSvgCoordinates({
    clientX: areaSelectionState.currentX,

    clientY: areaSelectionState.currentY,
  });

  if (!startPoint || !currentPoint) {
    return null;
  }

  return {
    minX: Math.min(startPoint.x, currentPoint.x),

    maxX: Math.max(startPoint.x, currentPoint.x),

    minY: Math.min(startPoint.y, currentPoint.y),

    maxY: Math.max(startPoint.y, currentPoint.y),
  };
}

/*
|--------------------------------------------------------------------------
| Verificar se houve movimento suficiente para ser arrasto
|--------------------------------------------------------------------------
*/

function hasAreaSelectionMovedEnough() {
  const deltaX = areaSelectionState.currentX - areaSelectionState.startX;

  const deltaY = areaSelectionState.currentY - areaSelectionState.startY;

  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  return distance >= AREA_SELECTION_MIN_PIXELS;
}

/*
|--------------------------------------------------------------------------
| Iniciar seleção por área
|--------------------------------------------------------------------------
*/

function startAreaSelection(event) {
  if (event.button !== 0) {
    return;
  }

  if (panState.active) {
    return;
  }

  areaSelectionState.active = true;

  areaSelectionState.dragging = false;

  areaSelectionState.startX = event.clientX;

  areaSelectionState.startY = event.clientY;

  areaSelectionState.currentX = event.clientX;

  areaSelectionState.currentY = event.clientY;

  areaSelectionState.pointerId = event.pointerId;

  leftMouseDownState.active = true;

  leftMouseDownState.moved = false;

  leftMouseDownState.pointerId = event.pointerId;

  leftMouseDownState.startClientX = event.clientX;

  leftMouseDownState.startClientY = event.clientY;
}

/*
|--------------------------------------------------------------------------
| Atualizar seleção por área
|--------------------------------------------------------------------------
*/

function updateAreaSelection(event) {
  if (
    !areaSelectionState.active ||
    areaSelectionState.pointerId !== event.pointerId
  ) {
    return;
  }

  areaSelectionState.currentX = event.clientX;

  areaSelectionState.currentY = event.clientY;

  if (!areaSelectionState.dragging) {
    if (!hasAreaSelectionMovedEnough()) {
      return;
    }

    areaSelectionState.dragging = true;

    leftMouseDownState.moved = true;

    createSelectionRectangle();

    console.log("Seleção por área iniciada.");
  }

  updateSelectionRectangle();
}

/*
|--------------------------------------------------------------------------
| Finalizar seleção por área
|--------------------------------------------------------------------------
*/

function finishAreaSelection(event) {
  if (
    !areaSelectionState.active ||
    areaSelectionState.pointerId !== event.pointerId
  ) {
    return false;
  }

  areaSelectionState.currentX = event.clientX;

  areaSelectionState.currentY = event.clientY;

  const wasDragging = areaSelectionState.dragging;

  const selectionBounds = wasDragging ? getAreaSelectionBounds() : null;

  areaSelectionState.active = false;

  areaSelectionState.dragging = false;

  areaSelectionState.pointerId = null;

  removeSelectionRectangle();

  if (wasDragging && selectionBounds) {
    selectEntitiesInArea(selectionBounds);

    console.log("Seleção por área concluída com sucesso.");
  }

  return wasDragging;
}

/*
|--------------------------------------------------------------------------
| Converter deslocamento da tela para unidades SVG
|--------------------------------------------------------------------------
*/

function getPanDeltaFromScreenMovement(deltaScreenX, deltaScreenY) {
  const rect = svgElement.getBoundingClientRect();

  if (
    !rect.width ||
    !rect.height ||
    !Number.isFinite(currentViewBox.width) ||
    !Number.isFinite(currentViewBox.height)
  ) {
    return {
      x: 0,

      y: 0,
    };
  }

  return {
    x: (deltaScreenX / rect.width) * currentViewBox.width,

    y: (deltaScreenY / rect.height) * currentViewBox.height,
  };
}

/*
|--------------------------------------------------------------------------
| Iniciar pan pelo botão direito
|--------------------------------------------------------------------------
*/

function startPan(event) {
  if (event.button !== 2) {
    return;
  }

  event.preventDefault();

  panState.active = true;

  panState.pointerId = event.pointerId;

  panState.lastClientX = event.clientX;

  panState.lastClientY = event.clientY;

  canvasContainer.classList.add("panning");

  console.log("Pan iniciado.");
}

/*
|--------------------------------------------------------------------------
| Atualizar pan
|--------------------------------------------------------------------------
*/

function updatePan(event) {
  if (!panState.active || panState.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();

  const deltaScreenX = event.clientX - panState.lastClientX;

  const deltaScreenY = event.clientY - panState.lastClientY;

  if (deltaScreenX === 0 && deltaScreenY === 0) {
    return;
  }

  const delta = getPanDeltaFromScreenMovement(deltaScreenX, deltaScreenY);

  /*
    |--------------------------------------------------------------------------
    | O conteúdo deve acompanhar o movimento do mouse.
    |
    | Por isso o deslocamento do ViewBox é aplicado com sinal invertido.
    |--------------------------------------------------------------------------
    */

  currentViewBox.x -= delta.x;

  currentViewBox.y -= delta.y;

  applyCurrentViewBox();

  panState.lastClientX = event.clientX;

  panState.lastClientY = event.clientY;
}

/*
|--------------------------------------------------------------------------
| Finalizar pan
|--------------------------------------------------------------------------
*/

function finishPan(event) {
  if (!panState.active || panState.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();

  panState.active = false;

  panState.pointerId = null;

  canvasContainer.classList.remove("panning");

  console.log("Pan finalizado.");
}

/*
|--------------------------------------------------------------------------
| Limpar seleção individual
|--------------------------------------------------------------------------
*/

function clearEntitySelection() {
  clearEntitySelectionVisual();

  selectedEntity = null;

  selectedSegment = null;

  activeSelectionListEntityId = null;

  entityPanel.classList.add("hidden");

  console.log("Seleção de entidade removida.");
}

/*
|--------------------------------------------------------------------------
| Selecionar entidade
|--------------------------------------------------------------------------
*/

function selectEntity(entity, selectionData = null) {
  if (!entity) {
    clearEntitySelection();

    return;
  }

  /*
    |--------------------------------------------------------------------------
    | Remove seleção visual anterior
    |--------------------------------------------------------------------------
    */

  if (selectedEntityElement) {
    selectedEntityElement.classList.remove("entity-selected");
  }

  /*
    |--------------------------------------------------------------------------
    | Guarda nova entidade
    |--------------------------------------------------------------------------
    */

  selectedEntity = entity;

  selectedSegment = selectionData?.segment ?? null;

  activeSelectionListEntityId = selectedEntities.has(entity.__id)
    ? entity.__id
    : null;

  /*
    |--------------------------------------------------------------------------
    | Localiza elemento SVG correspondente
    |--------------------------------------------------------------------------
    */

  selectedEntityElement = findSvgElementByEntity(entity);

  if (selectedEntityElement) {
    selectedEntityElement.classList.add("entity-selected");
  }

  /*
    |--------------------------------------------------------------------------
    | Atualiza painel
    |--------------------------------------------------------------------------
    */

  updateEntityPanel(entity, selectionData);

  /*
    |--------------------------------------------------------------------------
    | Atualiza lista caso a entidade pertença à seleção por área
    |--------------------------------------------------------------------------
    */

  if (selectedEntities.size > 0) {
    updateSelectionPanel();
  }

  /*
    |--------------------------------------------------------------------------
    | Log
    |--------------------------------------------------------------------------
    */

  console.log("======================================");

  console.log("ENTIDADE SELECIONADA");

  console.log("Tipo:", entity.type);

  console.log("ID:", entity.__id);

  console.log("Layer:", entity.layer ?? "0");

  /*
    |--------------------------------------------------------------------------
    | LINE
    |--------------------------------------------------------------------------
    */

  if (entity.type === "LINE") {
    const endpoints = getLineEndpoints(entity);

    const length = calculateLineLength(entity);

    if (endpoints) {
      console.log("Início:", {
        x: endpoints.start.x,

        y: endpoints.start.y,
      });

      console.log("Fim:", {
        x: endpoints.end.x,

        y: endpoints.end.y,
      });
    }

    console.log("Comprimento:", length);
  }

  /*
    |--------------------------------------------------------------------------
    | LWPOLYLINE
    |--------------------------------------------------------------------------
    */

  if (entity.type === "LWPOLYLINE") {
    const vertices = Array.isArray(entity.vertices) ? entity.vertices : [];

    console.log("Quantidade de vértices:", vertices.length);

    console.log("Fechada:", isPolylineClosed(entity));

    console.log("Comprimento:", calculatePolylineLength(entity));

    if (selectionData?.segment) {
      console.log("Segmento atingido:", {
        inicio: selectionData.segment.startIndex,

        fim: selectionData.segment.endIndex,
      });

      console.log("Distância até o segmento:", selectionData.distance);
    }

    console.log("Vértices:", vertices);
  }

  console.log("Entidade completa:", entity);

  console.log("======================================");
}

/*
|--------------------------------------------------------------------------
| Criar clique no desenho
|--------------------------------------------------------------------------
*/

function handleCanvasClick(event) {
  /*
    |--------------------------------------------------------------------------
    | Não processa clique se o usuário estava fazendo pan.
    |--------------------------------------------------------------------------
    */

  if (event.button !== 0) {
    return;
  }

  if (leftMouseDownState.moved) {
    return;
  }

  /*
    |--------------------------------------------------------------------------
    | Se a seleção por área estiver ativa, não processa clique.
    |--------------------------------------------------------------------------
    */

  if (areaSelectionState.dragging) {
    return;
  }

  const coordinates = screenToSvgCoordinates(event);

  console.log("Clique detectado:", coordinates);

  /*
    |--------------------------------------------------------------------------
    | Primeiro procura LWPOLYLINE
    |--------------------------------------------------------------------------
    */

  const nearestPolyline = findNearestPolyline(coordinates);

  /*
    |--------------------------------------------------------------------------
    | Depois procura LINE
    |--------------------------------------------------------------------------
    */

  const nearestLine = findNearestLine(coordinates);

  /*
    |--------------------------------------------------------------------------
    | Escolher a entidade geometricamente mais próxima
    |--------------------------------------------------------------------------
    */

  let nearestEntity = null;

  let selectionData = null;

  if (nearestPolyline && nearestLine) {
    const lineEndpoints = getLineEndpoints(nearestLine);

    const lineDistance = lineEndpoints
      ? calculatePointToSegmentDistance(
          coordinates,
          lineEndpoints.start,
          lineEndpoints.end,
        )
      : Infinity;

    if (nearestPolyline.distance < lineDistance) {
      nearestEntity = nearestPolyline.entity;

      selectionData = {
        distance: nearestPolyline.distance,

        segment: nearestPolyline.segment,
      };
    } else {
      nearestEntity = nearestLine;
    }
  } else if (nearestPolyline) {
    nearestEntity = nearestPolyline.entity;

    selectionData = {
      distance: nearestPolyline.distance,

      segment: nearestPolyline.segment,
    };
  } else if (nearestLine) {
    nearestEntity = nearestLine;
  }

  /*
    |--------------------------------------------------------------------------
    | Encontrou entidade
    |--------------------------------------------------------------------------
    */

  if (nearestEntity) {
    selectEntity(nearestEntity, selectionData);

    return;
  }

  /*
    |--------------------------------------------------------------------------
    | Nenhuma entidade encontrada.
    |
    | Remove seleção anterior e mantém o comportamento existente:
    | criar POINT.
    |--------------------------------------------------------------------------
    */

  clearEntitySelection();

  const point = createUserPoint(coordinates);

  /*
    |--------------------------------------------------------------------------
    | Renderizar ponto
    |--------------------------------------------------------------------------
    */

  renderUserPoint(point);

  /*
    |--------------------------------------------------------------------------
    | Log
    |--------------------------------------------------------------------------
    */

  console.log("======================================");

  console.log("Ponto criado pelo usuário");

  console.log("ID:", point.id);

  console.log("X:", point.x);

  console.log("Y:", point.y);

  console.log("Pontos atualmente selecionados:", selectedPoints);

  console.log("======================================");
}

/*
|--------------------------------------------------------------------------
| Configurar zoom do mouse
|--------------------------------------------------------------------------
*/

function setupZoomInteraction() {
  svgElement.addEventListener(
    "wheel",
    (event) => {
      /*
        |--------------------------------------------------------------------------
        | Impede o navegador de rolar a página enquanto o mouse estiver
        | sobre a planta.
        |--------------------------------------------------------------------------
        */

      event.preventDefault();

      /*
        |--------------------------------------------------------------------------
        | deltaY positivo:
        | roda o scroll para baixo → zoom out
        |
        | deltaY negativo:
        | roda o scroll para cima → zoom in
        |--------------------------------------------------------------------------
        */

      if (event.deltaY < 0) {
        zoomIn(event);
      } else if (event.deltaY > 0) {
        zoomOut(event);
      }
    },
    {
      passive: false,
    },
  );

  console.log("Zoom pelo scroll do mouse configurado.");
}

/*
|--------------------------------------------------------------------------
| Configurar atalhos de teclado para zoom
|--------------------------------------------------------------------------
*/

function setupZoomKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    /*
        |--------------------------------------------------------------------------
        | Só aplica os atalhos quando o foco não estiver em um campo de texto.
        |--------------------------------------------------------------------------
        */

    const activeElement = document.activeElement;

    const isTyping =
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "SELECT" ||
        activeElement.isContentEditable);

    if (isTyping) {
      return;
    }

    /*
        |--------------------------------------------------------------------------
        | Para teclado, utilizamos o centro visual da planta.
        |--------------------------------------------------------------------------
        */

    const rect = svgElement.getBoundingClientRect();

    const centerEvent = {
      clientX: rect.left + rect.width / 2,

      clientY: rect.top + rect.height / 2,
    };

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();

      zoomIn(centerEvent);

      return;
    }

    if (event.key === "-" || event.key === "_") {
      event.preventDefault();

      zoomOut(centerEvent);
    }
  });

  console.log("Atalhos de teclado do zoom configurados.");
}

/*
|--------------------------------------------------------------------------
| Configurar interação do mouse
|--------------------------------------------------------------------------
*/

function setupMouseInteraction() {
  /*
    |--------------------------------------------------------------------------
    | Coordenadas
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("mousemove", updateMouseCoordinates);

  /*
    |--------------------------------------------------------------------------
    | Clique simples
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("click", handleCanvasClick);

  /*
    |--------------------------------------------------------------------------
    | Fechar painel de entidade
    |--------------------------------------------------------------------------
    */

  entityPanelCloseButton.addEventListener("click", (event) => {
    event.stopPropagation();

    clearEntitySelection();
  });

  /*
    |--------------------------------------------------------------------------
    | Fechar/limpar seleção por área
    |--------------------------------------------------------------------------
    */

  selectionPanelCloseButton.addEventListener("click", (event) => {
    event.stopPropagation();

    clearAreaSelection();

    clearEntitySelection();
  });

  /*
    |--------------------------------------------------------------------------
    | Início da interação com botão esquerdo
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    startAreaSelection(event);
  });

  /*
    |--------------------------------------------------------------------------
    | Início do pan com botão direito
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 2) {
      return;
    }

    startPan(event);
  });

  /*
    |--------------------------------------------------------------------------
    | Movimento geral
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("pointermove", (event) => {
    updateAreaSelection(event);

    updatePan(event);
  });

  /*
    |--------------------------------------------------------------------------
    | Finalização do botão esquerdo
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("pointerup", (event) => {
    if (event.button !== 0) {
      return;
    }

    const wasAreaSelection = finishAreaSelection(event);

    if (leftMouseDownState.pointerId === event.pointerId) {
      leftMouseDownState.active = false;

      if (!wasAreaSelection) {
        leftMouseDownState.moved = false;
      }
    }
  });

  /*
    |--------------------------------------------------------------------------
    | Finalização do botão direito
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("pointerup", (event) => {
    if (event.button !== 2) {
      return;
    }

    finishPan(event);
  });

  /*
    |--------------------------------------------------------------------------
    | Caso o mouse saia do SVG enquanto um botão estiver pressionado.
    |--------------------------------------------------------------------------
    */

  window.addEventListener("pointerup", (event) => {
    if (
      areaSelectionState.active &&
      areaSelectionState.pointerId === event.pointerId
    ) {
      finishAreaSelection(event);
    }

    if (panState.active && panState.pointerId === event.pointerId) {
      finishPan(event);
    }

    if (leftMouseDownState.pointerId === event.pointerId) {
      leftMouseDownState.active = false;

      leftMouseDownState.moved = false;

      leftMouseDownState.pointerId = null;
    }
  });

  /*
    |--------------------------------------------------------------------------
    | Impedir menu de contexto do botão direito.
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  /*
    |--------------------------------------------------------------------------
    | Captura coordenadas mesmo durante pan/seleção.
    |--------------------------------------------------------------------------
    */

  svgElement.addEventListener("pointermove", updateMouseCoordinates);

  /*
    |--------------------------------------------------------------------------
    | Zoom
    |--------------------------------------------------------------------------
    */

  setupZoomInteraction();

  setupZoomKeyboardShortcuts();

  console.log("Interação do mouse configurada.");

  console.log("Seleção por área configurada.");

  console.log("Pan pelo botão direito configurado.");
}

/*
|--------------------------------------------------------------------------
| Renderizar DXF
|--------------------------------------------------------------------------
*/

function renderDxf(dxf) {
  svgElement.innerHTML = "";

  selectedEntity = null;

  selectedEntityElement = null;

  selectedSegment = null;

  selectedEntities.clear();

  activeSelectionListEntityId = null;

  selectionPanel.classList.add("hidden");

  entityPanel.classList.add("hidden");

  selectionRectangleElement = null;

  const bounds = calculateBounds(dxf);

  console.log("Limites calculados:", bounds);

  configureSvg(bounds);

  const background = createBackground(bounds);

  svgElement.appendChild(background);

  renderLines(dxf);

  renderPolylines(dxf);

  renderCircles(dxf);

  renderArcs(dxf);

  renderTexts(dxf);

  renderMTexts(dxf);

  createBoundsMarker(bounds);

  console.log("Elementos SVG criados:", svgElement.children.length);
}

/*
|--------------------------------------------------------------------------
| Mostrar sucesso
|--------------------------------------------------------------------------
*/

function showSuccess() {
  loadingElement.textContent = "DXF carregado com sucesso!";

  setTimeout(() => {
    loadingElement.classList.add("hidden");
  }, 2000);
}

/*
|--------------------------------------------------------------------------
| Mostrar erro
|--------------------------------------------------------------------------
*/

function showError(error) {
  console.error("Erro ao carregar DXF:", error);

  loadingElement.classList.add("hidden");

  errorElement.textContent = error.message || "Ocorreu um erro desconhecido.";

  errorElement.classList.remove("hidden");
}

/*
|--------------------------------------------------------------------------
| Inicialização
|--------------------------------------------------------------------------
*/

async function main() {
  try {
    console.clear();

    console.log("======================================");

    console.log("Iniciando Editor DXF");

    console.log("======================================");

    const content = await loadDxf();

    console.log("Arquivo DXF carregado.");

    console.log("Tamanho do arquivo:", content.length, "caracteres");

    const dxf = parseDxf(content);

    console.log("DXF convertido com sucesso.");

    currentDxf = dxf;

    prepareEntities(dxf);

    console.log("DXF completo:", dxf);

    console.log("Total de entidades:", dxf.entities.length);

    analyzeEntities(dxf);

    renderDxf(dxf);

    /*
      |--------------------------------------------------------------------------
      | Configurar mouse somente depois do SVG existir
      |--------------------------------------------------------------------------
      */

    setupMouseInteraction();

    showSuccess();

    console.log("======================================");

    console.log("DXF processado.");

    console.log("======================================");
  } catch (error) {
    showError(error);
  }
}

main();
