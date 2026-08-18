const IFC_ENTITY_PATTERN = /#(\d+)=\s*(IFC[A-Z0-9_]+)\(([\s\S]*?)\);/g;
const PRODUCT_TYPES = new Set([
  "IFCBUILDINGELEMENTPROXY",
  "IFCCOLUMN",
  "IFCCOVERING",
  "IFCCURTAINWALL",
  "IFCDOOR",
  "IFCFLOWTERMINAL",
  "IFCFURNISHINGELEMENT",
  "IFCMEMBER",
  "IFCPLATE",
  "IFCRAILING",
  "IFCRAMP",
  "IFCROOF",
  "IFCSLAB",
  "IFCSPACE",
  "IFCSTAIR",
  "IFCWALL",
  "IFCWALLSTANDARDCASE",
  "IFCWINDOW",
]);

export function parseIfcText(text) {
  const entitiesById = new Map();
  const products = [];
  const countsByType = new Map();
  let match;

  while ((match = IFC_ENTITY_PATTERN.exec(text)) !== null) {
    const [, stepId, type, rawArgs] = match;
    const id = Number(stepId);
    const args = splitIfcArguments(rawArgs);
    const entity = { id, type, args };

    entitiesById.set(id, entity);
    countsByType.set(type, (countsByType.get(type) || 0) + 1);

    if (PRODUCT_TYPES.has(type)) {
      products.push(createProduct(entity));
    }
  }

  const productsWithGeometry = products.map((product) =>
    enrichProductGeometry(product, entitiesById),
  );
  const modelBounds = calculateModelBounds(productsWithGeometry);

  return {
    schema: extractSchema(text),
    units: extractUnits(text),
    products: productsWithGeometry,
    modelBounds,
    countsByType: [...countsByType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    entitiesById,
  };
}

function createProduct(entity) {
  return {
    stepId: entity.id,
    type: entity.type,
    globalId: cleanIfcValue(entity.args[0]),
    name: cleanIfcValue(entity.args[2]) || "(sem nome)",
    description: cleanIfcValue(entity.args[3]),
    objectType: cleanIfcValue(entity.args[4]),
    longName: cleanIfcValue(entity.args[7]),
    placementRef: getRefId(entity.args[5]),
    representationRef: getRefId(entity.args[6]),
  };
}

function enrichProductGeometry(product, entitiesById) {
  const placement = resolvePlacement(product.placementRef, entitiesById);
  const localPoints = resolveProductPoints(product.representationRef, entitiesById);
  const points = localPoints.map((point) => transformLocalPoint(point, placement));
  const bodyFaces = resolveProductFaces(product.representationRef, entitiesById).map(
    (face) => face.map((point) => transformLocalPoint(point, placement)),
  );

  return {
    ...product,
    placement,
    points,
    bounds: calculateBounds(points),
    bodyFaces,
    bodyBounds: calculateBounds3d(bodyFaces.flat()),
  };
}

function resolvePlacement(placementRef, entitiesById, seen = new Set()) {
  if (!placementRef || seen.has(placementRef)) {
    return createPlacement();
  }

  seen.add(placementRef);

  const placement = entitiesById.get(placementRef);

  if (!placement || placement.type !== "IFCLOCALPLACEMENT") {
    return createPlacement();
  }

  const parent = resolvePlacement(getRefId(placement.args[0]), entitiesById, seen);
  const axisPlacement = entitiesById.get(getRefId(placement.args[1]));
  const location = axisPlacement
    ? readPoint(getRefId(axisPlacement.args[0]), entitiesById)
    : null;
  const localDirection = axisPlacement
    ? readDirection(getRefId(axisPlacement.args[2]), entitiesById)
    : null;
  const localRotation = localDirection
    ? Math.atan2(localDirection.y, localDirection.x)
    : 0;
  const translatedLocation = transformLocalPoint(location || { x: 0, y: 0 }, parent);
  const rotation = parent.rotation + localRotation;

  return {
    x: translatedLocation.x,
    y: translatedLocation.y,
    z: translatedLocation.z || 0,
    rotation,
    cos: Math.cos(rotation),
    sin: Math.sin(rotation),
  };
}

function createPlacement() {
  return {
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    cos: 1,
    sin: 0,
  };
}

function transformLocalPoint(point, placement) {
  return {
    x: placement.x + point.x * placement.cos - point.y * placement.sin,
    y: placement.y + point.x * placement.sin + point.y * placement.cos,
    z: (placement.z || 0) + (point.z || 0),
  };
}

function resolveProductFaces(representationRef, entitiesById) {
  const definition = entitiesById.get(representationRef);

  if (!definition || definition.type !== "IFCPRODUCTDEFINITIONSHAPE") {
    return [];
  }

  return getRefList(definition.args[2])
    .map((shapeRef) => entitiesById.get(shapeRef))
    .filter((shape) => shape?.type === "IFCSHAPEREPRESENTATION")
    .filter((shape) => cleanIfcValue(shape.args[1]).toUpperCase() === "BODY")
    .flatMap((shape) => resolveShapeFaces(shape, entitiesById));
}

function resolveShapeFaces(shape, entitiesById) {
  return getRefList(shape.args[3]).flatMap((itemRef) =>
    resolveBrepFaces(itemRef, entitiesById),
  );
}

function resolveBrepFaces(itemRef, entitiesById) {
  const brep = entitiesById.get(itemRef);

  if (!brep || brep.type !== "IFCFACETEDBREP") {
    return [];
  }

  const shell = entitiesById.get(getRefId(brep.args[0]));

  if (!shell || shell.type !== "IFCCLOSEDSHELL") {
    return [];
  }

  return getRefList(shell.args[0])
    .map((faceRef) => resolveFace(faceRef, entitiesById))
    .filter((face) => face.length >= 3);
}

function resolveFace(faceRef, entitiesById) {
  const face = entitiesById.get(faceRef);

  if (!face || face.type !== "IFCFACE") {
    return [];
  }

  const boundRefs = getRefList(face.args[0]);
  const outerBound = boundRefs
    .map((boundRef) => entitiesById.get(boundRef))
    .find((bound) => bound?.type === "IFCFACEOUTERBOUND");
  const loop = entitiesById.get(getRefId(outerBound?.args[0]));

  if (!loop || loop.type !== "IFCPOLYLOOP") {
    return [];
  }

  return getRefList(loop.args[0])
    .map((pointRef) => readPoint(pointRef, entitiesById))
    .filter(Boolean);
}

function resolveProductPoints(representationRef, entitiesById) {
  const definition = entitiesById.get(representationRef);

  if (!definition || definition.type !== "IFCPRODUCTDEFINITIONSHAPE") {
    return [];
  }

  const representations = getRefList(definition.args[2])
    .map((shapeRef) => entitiesById.get(shapeRef))
    .filter((shape) => shape?.type === "IFCSHAPEREPRESENTATION");
  const footprintRepresentations = representations.filter(
    (shape) => cleanIfcValue(shape.args[1]).toUpperCase() === "FOOTPRINT",
  );
  const points = [];

  for (const shape of footprintRepresentations.length
    ? footprintRepresentations
    : representations) {
    const shapePoints = resolveShapePoints(shape, entitiesById);

    if (shapePoints.length) {
      points.push(...shapePoints);
    }
  }

  return points;
}

function resolveShapePoints(shape, entitiesById) {
  const itemRefs = getRefList(shape.args[3]);
  const points = [];

  for (const itemRef of itemRefs) {
    points.push(...resolveGeometryItemPoints(itemRef, entitiesById, new Set()));
  }

  return points;
}

function resolveGeometryItemPoints(itemRef, entitiesById, seen) {
  if (!itemRef || seen.has(itemRef)) {
    return [];
  }

  seen.add(itemRef);

  const item = entitiesById.get(itemRef);

  if (!item) {
    return [];
  }

  if (item.type === "IFCCARTESIANPOINT") {
    const point = parsePointArgument(item.args[0]);
    return point ? [point] : [];
  }

  if (item.type === "IFCPOLYLINE") {
    return getRefList(item.args[0])
      .map((pointRef) => readPoint(pointRef, entitiesById))
      .filter(Boolean);
  }

  const nestedRefs = item.args.flatMap((arg) => getRefList(arg));

  return nestedRefs.flatMap((nestedRef) =>
    resolveGeometryItemPoints(nestedRef, entitiesById, seen),
  );
}

function readPoint(pointRef, entitiesById) {
  const point = entitiesById.get(pointRef);

  if (!point || point.type !== "IFCCARTESIANPOINT") {
    return null;
  }

  return parsePointArgument(point.args[0]);
}

function readDirection(directionRef, entitiesById) {
  const direction = entitiesById.get(directionRef);

  if (!direction || direction.type !== "IFCDIRECTION") {
    return null;
  }

  return parsePointArgument(direction.args[0]);
}

function parsePointArgument(value) {
  const numbers = String(value)
    .replace(/[()]/g, "")
    .split(",")
    .map((number) => Number(number.trim()))
    .filter((number) => Number.isFinite(number));

  if (numbers.length < 2) {
    return null;
  }

  return {
    x: numbers[0],
    y: numbers[1],
    z: numbers[2] || 0,
  };
}

function calculateBounds(points) {
  if (!points.length) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function calculateBounds3d(points) {
  if (!points.length) {
    return null;
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const zs = points.map((point) => point.z || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
  };
}

function calculateModelBounds(products) {
  const bounds = products.map((product) => product.bounds).filter(Boolean);

  if (!bounds.length) {
    return null;
  }

  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function extractSchema(text) {
  const match = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);

  return match?.[1] || "desconhecido";
}

function extractUnits(text) {
  const lengthUnitMatch = text.match(
    /IFCSIUNIT\(\*,\.LENGTHUNIT\.,([^,]*),\.([A-Z_]+)\.\)/i,
  );

  if (!lengthUnitMatch) {
    return { length: "desconhecida" };
  }

  const prefix = cleanIfcValue(lengthUnitMatch[1]).replace(/\./g, "");
  const unit = cleanIfcValue(lengthUnitMatch[2]).replace(/\./g, "");

  return {
    length: [prefix, unit].filter(Boolean).join(" ") || unit,
  };
}

function splitIfcArguments(rawArgs) {
  const args = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const char = rawArgs[index];
    const nextChar = rawArgs[index + 1];

    if (char === "'" && nextChar === "'") {
      current += "''";
      index += 1;
      continue;
    }

    if (char === "'") {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString && char === "(") {
      depth += 1;
    }

    if (!inString && char === ")") {
      depth -= 1;
    }

    if (!inString && depth === 0 && char === ",") {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function getRefId(value) {
  const match = String(value || "").match(/#(\d+)/);

  return match ? Number(match[1]) : null;
}

function getRefList(value) {
  return [...String(value || "").matchAll(/#(\d+)/g)].map((match) =>
    Number(match[1]),
  );
}

function cleanIfcValue(value) {
  if (!value || value === "$" || value === "*") {
    return "";
  }

  return value
    .replace(/^'/, "")
    .replace(/'$/, "")
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .trim();
}
