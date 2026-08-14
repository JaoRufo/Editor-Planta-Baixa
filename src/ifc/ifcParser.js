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

  return {
    schema: extractSchema(text),
    units: extractUnits(text),
    products,
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
