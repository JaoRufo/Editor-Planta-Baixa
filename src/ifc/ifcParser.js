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

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseIfcText(text) {
  const entitiesById = new Map();
  const products = [];
  const countsByType = new Map();
  let match;

  IFC_ENTITY_PATTERN.lastIndex = 0;

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

  const floors = extractFloors(entitiesById);
  const floorByProduct = buildFloorByProductMap(entitiesById);

  const productsWithGeometry = products.map((product) =>
    enrichProductGeometry(product, entitiesById, floors, floorByProduct),
  );

  const modelBounds = calculateModelBounds(productsWithGeometry);

  return {
    schema: extractSchema(text),
    units: extractUnits(text),
    products: productsWithGeometry,
    floors,
    modelBounds,
    countsByType: [...countsByType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    entitiesById,
  };
}

// ─── Floors (IfcBuildingStorey) ───────────────────────────────────────────────

function extractFloors(entitiesById) {
  const floors = [];

  for (const entity of entitiesById.values()) {
    if (entity.type !== "IFCBUILDINGSTOREY") continue;

    const elevation = Number(entity.args[9]);

    floors.push({
      stepId: entity.id,
      globalId: cleanIfcValue(entity.args[0]),
      name: cleanIfcValue(entity.args[2]) || `Andar ${floors.length + 1}`,
      elevation: Number.isFinite(elevation) ? elevation : 0,
    });
  }

  return floors.sort((a, b) => a.elevation - b.elevation);
}

/**
 * Builds a map of productStepId -> floorStepId by walking
 * IfcRelContainedInSpatialStructure and IfcRelAggregates relationships.
 */
function buildFloorByProductMap(entitiesById) {
  const map = new Map();

  for (const entity of entitiesById.values()) {
    if (entity.type === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      // args[4] = RelatingStructure, args[5] = RelatedElements (list)
      const structureRef = getRefId(entity.args[4]);
      const structure = entitiesById.get(structureRef);

      if (structure?.type !== "IFCBUILDINGSTOREY") continue;

      for (const productRef of getRefList(entity.args[5])) {
        map.set(productRef, structureRef);
      }
    }

    if (entity.type === "IFCRELAGGREGATES") {
      // args[4] = RelatingObject, args[5] = RelatedObjects (list)
      const parentRef = getRefId(entity.args[4]);
      const parent = entitiesById.get(parentRef);

      if (parent?.type !== "IFCBUILDINGSTOREY") continue;

      for (const productRef of getRefList(entity.args[5])) {
        map.set(productRef, parentRef);
      }
    }
  }

  return map;
}

// ─── Product creation ─────────────────────────────────────────────────────────

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

function enrichProductGeometry(product, entitiesById, floors, floorByProduct) {
  const placement = resolvePlacement(product.placementRef, entitiesById);
  const localPoints = resolveProductPoints(product.representationRef, entitiesById);
  const points = localPoints.map((point) => transformLocalPoint(point, placement));
  const bodyFaces = resolveProductFaces(product.representationRef, entitiesById).map(
    (face) => face.map((point) => transformLocalPoint(point, placement)),
  );

  const floorStepId = floorByProduct.get(product.stepId) ?? null;
  const floor = floors.find((f) => f.stepId === floorStepId) ?? null;

  return {
    ...product,
    placement,
    points,
    bounds: calculateBounds(points),
    bodyFaces,
    bodyBounds: calculateBounds3d(bodyFaces.flat()),
    floorStepId,
    floorName: floor?.name ?? null,
    floorElevation: floor?.elevation ?? null,
  };
}

// ─── Placement resolution ─────────────────────────────────────────────────────

function resolvePlacement(placementRef, entitiesById, seen = new Set()) {
  if (!placementRef || seen.has(placementRef)) {
    return createIdentityPlacement();
  }

  seen.add(placementRef);

  const placement = entitiesById.get(placementRef);

  if (!placement || placement.type !== "IFCLOCALPLACEMENT") {
    return createIdentityPlacement();
  }

  const parent = resolvePlacement(getRefId(placement.args[0]), entitiesById, seen);
  const axisPlacement = entitiesById.get(getRefId(placement.args[1]));

  if (!axisPlacement) {
    return parent;
  }

  const location = readPoint(getRefId(axisPlacement.args[0]), entitiesById);

  // IFCAXIS2PLACEMENT3D: args[1]=Axis(Z), args[2]=RefDirection(X)
  // IFCAXIS2PLACEMENT2D: args[1]=RefDirection(X)
  const refDirIndex = axisPlacement.type === "IFCAXIS2PLACEMENT3D" ? 2 : 1;
  const localDirection = readDirection(getRefId(axisPlacement.args[refDirIndex]), entitiesById);
  const localRotation = localDirection ? Math.atan2(localDirection.y, localDirection.x) : 0;
  const translatedLocation = transformLocalPoint(location || { x: 0, y: 0, z: 0 }, parent);
  const rotation = parent.rotation + localRotation;

  return {
    x: translatedLocation.x,
    y: translatedLocation.y,
    z: translatedLocation.z ?? 0,
    rotation,
    cos: Math.cos(rotation),
    sin: Math.sin(rotation),
  };
}

function createIdentityPlacement() {
  return { x: 0, y: 0, z: 0, rotation: 0, cos: 1, sin: 0 };
}

function transformLocalPoint(point, placement) {
  return {
    x: placement.x + point.x * placement.cos - point.y * placement.sin,
    y: placement.y + point.x * placement.sin + point.y * placement.cos,
    z: (placement.z ?? 0) + (point.z ?? 0),
  };
}

// ─── Footprint points resolution ─────────────────────────────────────────────

function resolveProductPoints(representationRef, entitiesById) {
  const definition = entitiesById.get(representationRef);

  if (!definition || definition.type !== "IFCPRODUCTDEFINITIONSHAPE") {
    return [];
  }

  const representations = getRefList(definition.args[2])
    .map((shapeRef) => entitiesById.get(shapeRef))
    .filter((shape) => shape?.type === "IFCSHAPEREPRESENTATION");

  // Priority: FOOTPRINT > BODY > anything else
  const priority = ["FOOTPRINT", "BODY", ""];
  for (const target of priority) {
    const candidates = target
      ? representations.filter(
          (shape) => cleanIfcValue(shape.args[1]).toUpperCase() === target,
        )
      : representations;

    for (const shape of candidates) {
      const points = resolveShapePoints(shape, entitiesById);
      if (points.length >= 3) return points;
    }
  }

  return [];
}

function resolveShapePoints(shape, entitiesById) {
  const points = [];

  for (const itemRef of getRefList(shape.args[3])) {
    points.push(...resolveGeometryItemPoints(itemRef, entitiesById, new Set()));
  }

  return points;
}

function resolveGeometryItemPoints(itemRef, entitiesById, seen) {
  if (!itemRef || seen.has(itemRef)) return [];

  seen.add(itemRef);

  const item = entitiesById.get(itemRef);
  if (!item) return [];

  switch (item.type) {
    case "IFCCARTESIANPOINT": {
      const point = parsePointArgument(item.args[0]);
      return point ? [point] : [];
    }

    case "IFCPOLYLINE":
      return getRefList(item.args[0])
        .map((ref) => readPoint(ref, entitiesById))
        .filter(Boolean);

    case "IFCCOMPOSITECURVE":
      // args[0] = Segments (list of IfcCompositeCurveSegment)
      return getRefList(item.args[0]).flatMap((segRef) =>
        resolveGeometryItemPoints(segRef, entitiesById, seen),
      );

    case "IFCCOMPOSITECURVESEGMENT":
      // args[2] = ParentCurve
      return resolveGeometryItemPoints(getRefId(item.args[2]), entitiesById, seen);

    case "IFCTRIMMEDCURVE": {
      // args[0] = BasisCurve — approximate with endpoints from Trim1/Trim2
      const basisPoints = resolveGeometryItemPoints(
        getRefId(item.args[0]),
        entitiesById,
        seen,
      );
      return basisPoints;
    }

    case "IFCEXTRUDEDAREASOLID":
    case "IFCSURFACEOFLINEAREXTRUSION": {
      // args[0] = SweptArea (profile), args[1] = Position (placement)
      const profilePoints = resolveProfilePoints(getRefId(item.args[0]), entitiesById, seen);
      if (!profilePoints.length) return [];

      // Apply the solid's own placement on top of the product placement
      const solidPlacement = resolvePlacement(getRefId(item.args[1]), entitiesById, new Set());
      return profilePoints.map((p) => transformLocalPoint(p, solidPlacement));
    }

    case "IFCBOOLEANCLIPPINGRESULT":
    case "IFCBOOLEANRESULT":
      // args[1] = FirstOperand — use the positive solid, ignore the clip
      return resolveGeometryItemPoints(getRefId(item.args[1]), entitiesById, seen);

    case "IFCMAPPEDITEM": {
      // args[0] = MappingSource (IfcRepresentationMap), args[1] = MappingTarget (placement)
      const mapSource = entitiesById.get(getRefId(item.args[0]));
      if (!mapSource) return [];

      // mapSource.args[0] = MappingOrigin (placement), mapSource.args[1] = MappedRepresentation
      const mappedRep = entitiesById.get(getRefId(mapSource.args[1]));
      if (!mappedRep) return [];

      const mappedPoints = resolveShapePoints(mappedRep, entitiesById);
      const targetPlacement = resolvePlacement(getRefId(item.args[1]), entitiesById, new Set());
      return mappedPoints.map((p) => transformLocalPoint(p, targetPlacement));
    }

    default: {
      // Generic fallback: recurse into all referenced entities
      const nestedRefs = item.args.flatMap((arg) => getRefList(arg));
      return nestedRefs.flatMap((ref) => resolveGeometryItemPoints(ref, entitiesById, seen));
    }
  }
}

// ─── Profile resolution (for extrusions) ─────────────────────────────────────

function resolveProfilePoints(profileRef, entitiesById, seen = new Set()) {
  const profile = entitiesById.get(profileRef);
  if (!profile) return [];

  switch (profile.type) {
    case "IFCARBITRARYCLOSEDPROFILEDEF":
      // args[2] = OuterCurve
      return resolveGeometryItemPoints(getRefId(profile.args[2]), entitiesById, seen);

    case "IFCARBITRARYPROFILEDEFWITHVOIDS":
      // args[2] = OuterCurve (ignore inner voids for footprint purposes)
      return resolveGeometryItemPoints(getRefId(profile.args[2]), entitiesById, seen);

    case "IFCRECTANGLEPROFILEDEF": {
      // args[2] = Position (optional), args[3] = XDim, args[4] = YDim
      const xHalf = Number(profile.args[3]) / 2;
      const yHalf = Number(profile.args[4]) / 2;
      const base = [
        { x: -xHalf, y: -yHalf, z: 0 },
        { x:  xHalf, y: -yHalf, z: 0 },
        { x:  xHalf, y:  yHalf, z: 0 },
        { x: -xHalf, y:  yHalf, z: 0 },
      ];
      const pos = resolvePlacement(getRefId(profile.args[2]), entitiesById, new Set());
      return base.map((p) => transformLocalPoint(p, pos));
    }

    case "IFCCIRCLEPROFILEDEF": {
      // args[3] = Radius — approximate with 16-gon
      const r = Number(profile.args[3]);
      const pos = resolvePlacement(getRefId(profile.args[2]), entitiesById, new Set());
      const pts = Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        return transformLocalPoint({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, z: 0 }, pos);
      });
      return pts;
    }

    case "IFCCOMPOSITEPROFILEDEF":
      // args[2] = Profiles (list) — union of all sub-profiles
      return getRefList(profile.args[2]).flatMap((ref) =>
        resolveProfilePoints(ref, entitiesById, seen),
      );

    case "IFCISHAPEPROFILEDEF":
    case "IFCLSHAPEPROFILEDEF":
    case "IFCTSHAPEPROFILEDEF":
    case "IFCUSHAPEPROFILEDEF":
    case "IFCZSHAPEPROFILEDEF": {
      // Structural profiles — approximate with overall bounding box
      // args[3]=OverallWidth, args[4]=OverallDepth (or similar, varies by type)
      const w = Number(profile.args[3]) || 0;
      const d = Number(profile.args[4]) || 0;
      if (!w || !d) return [];
      const pos = resolvePlacement(getRefId(profile.args[2]), entitiesById, new Set());
      const base = [
        { x: -w / 2, y: -d / 2, z: 0 },
        { x:  w / 2, y: -d / 2, z: 0 },
        { x:  w / 2, y:  d / 2, z: 0 },
        { x: -w / 2, y:  d / 2, z: 0 },
      ];
      return base.map((p) => transformLocalPoint(p, pos));
    }

    default:
      return [];
  }
}

// ─── Body faces resolution (BREP) ────────────────────────────────────────────

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
  if (!brep) return [];

  if (brep.type === "IFCFACETEDBREP") {
    const shell = entitiesById.get(getRefId(brep.args[0]));
    if (!shell || shell.type !== "IFCCLOSEDSHELL") return [];
    return getRefList(shell.args[0])
      .map((faceRef) => resolveFace(faceRef, entitiesById))
      .filter((face) => face.length >= 3);
  }

  if (
    brep.type === "IFCBOOLEANCLIPPINGRESULT" ||
    brep.type === "IFCBOOLEANRESULT"
  ) {
    return resolveBrepFaces(getRefId(brep.args[1]), entitiesById);
  }

  return [];
}

function resolveFace(faceRef, entitiesById) {
  const face = entitiesById.get(faceRef);
  if (!face || face.type !== "IFCFACE") return [];

  const outerBound = getRefList(face.args[0])
    .map((ref) => entitiesById.get(ref))
    .find((bound) => bound?.type === "IFCFACEOUTERBOUND");

  const loop = entitiesById.get(getRefId(outerBound?.args[0]));
  if (!loop || loop.type !== "IFCPOLYLOOP") return [];

  return getRefList(loop.args[0])
    .map((ref) => readPoint(ref, entitiesById))
    .filter(Boolean);
}

// ─── Primitive readers ────────────────────────────────────────────────────────

function readPoint(pointRef, entitiesById) {
  const point = entitiesById.get(pointRef);
  if (!point || point.type !== "IFCCARTESIANPOINT") return null;
  return parsePointArgument(point.args[0]);
}

function readDirection(directionRef, entitiesById) {
  const direction = entitiesById.get(directionRef);
  if (!direction || direction.type !== "IFCDIRECTION") return null;
  return parsePointArgument(direction.args[0]);
}

function parsePointArgument(value) {
  const numbers = String(value)
    .replace(/[()]/g, "")
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n));

  if (numbers.length < 2) return null;

  return { x: numbers[0], y: numbers[1], z: numbers[2] ?? 0 };
}

// ─── Bounds ───────────────────────────────────────────────────────────────────

function calculateBounds(points) {
  if (!points.length) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function calculateBounds3d(points) {
  if (!points.length) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    minX, minY, minZ,
    maxX, maxY, maxZ,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
  };
}

function calculateModelBounds(products) {
  const bounds = products.map((p) => p.bounds).filter(Boolean);
  if (!bounds.length) return null;

  const minX = Math.min(...bounds.map((b) => b.minX));
  const minY = Math.min(...bounds.map((b) => b.minY));
  const maxX = Math.max(...bounds.map((b) => b.maxX));
  const maxY = Math.max(...bounds.map((b) => b.maxY));

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ─── Schema / units ───────────────────────────────────────────────────────────

function extractSchema(text) {
  const match = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  return match?.[1] || "desconhecido";
}

function extractUnits(text) {
  const lengthUnitMatch = text.match(
    /IFCSIUNIT\(\*,\.LENGTHUNIT\.,([^,]*),\.([A-Z_]+)\.\)/i,
  );

  if (!lengthUnitMatch) return { length: "desconhecida" };

  const prefix = cleanIfcValue(lengthUnitMatch[1]).replace(/\./g, "");
  const unit = cleanIfcValue(lengthUnitMatch[2]).replace(/\./g, "");

  return { length: [prefix, unit].filter(Boolean).join(" ") || unit };
}

// ─── STEP argument parser ─────────────────────────────────────────────────────

function splitIfcArguments(rawArgs) {
  const args = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let i = 0; i < rawArgs.length; i += 1) {
    const char = rawArgs[i];
    const next = rawArgs[i + 1];

    if (char === "'" && next === "'") {
      current += "''";
      i += 1;
      continue;
    }

    if (char === "'") {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString && char === "(") depth += 1;
    if (!inString && char === ")") depth -= 1;

    if (!inString && depth === 0 && char === ",") {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) args.push(current.trim());

  return args;
}

function getRefId(value) {
  const match = String(value || "").match(/#(\d+)/);
  return match ? Number(match[1]) : null;
}

function getRefList(value) {
  return [...String(value || "").matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
}

function cleanIfcValue(value) {
  if (!value || value === "$" || value === "*") return "";

  return value
    .replace(/^'/, "")
    .replace(/'$/, "")
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\X2\\([0-9A-F]{4,}?)\\X0\\/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .trim();
}
