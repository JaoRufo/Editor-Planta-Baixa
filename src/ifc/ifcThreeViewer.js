import * as THREE from "https://esm.sh/three@0.160.0";
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const TYPE_COLORS = {
  IFCSPACE: 0xd8d8d8,
  IFCWALL: 0x9a9a9a,
  IFCWALLSTANDARDCASE: 0x9a9a9a,
  IFCDOOR: 0xc98945,
  IFCWINDOW: 0x5fb3d9,
  IFCCOLUMN: 0x787878,
  IFCSLAB: 0x6f757d,
  IFCCOVERING: 0xa3a3a3,
  IFCFURNISHINGELEMENT: 0xb98c62,
  IFCFLOWTERMINAL: 0x7a9f7a,
  IFCCURTAINWALL: 0x74a6bf,
  IFCMEMBER: 0x858585,
  IFCPLATE: 0x7f8a92,
  IFCSTAIR: 0xa58b64,
  IFCROOF: 0x875a4c,
};

const TYPE_HEIGHTS = {
  IFCSPACE: 2600,
  IFCWALL: 3000,
  IFCWALLSTANDARDCASE: 3000,
  IFCDOOR: 2200,
  IFCWINDOW: 1400,
  IFCCOLUMN: 3000,
  IFCSLAB: 180,
  IFCCOVERING: 80,
  IFCFURNISHINGELEMENT: 900,
  IFCFLOWTERMINAL: 700,
  IFCCURTAINWALL: 3000,
  IFCMEMBER: 3000,
  IFCPLATE: 120,
  IFCSTAIR: 1200,
  IFCROOF: 400,
};

const DEFAULT_COLOR = 0x8d8d8d;
const HIGHLIGHT_COLOR = 0xffc247;
const SELECTED_COLOR = 0xff7a3d;
const IFC_TO_THREE_SCALE = 0.001;
const SPACE_FLOOR_HEIGHT = 0.06;
const SPACE_LINE_HEIGHT = 0.31;
const SPACE_MESH_OPACITY = 0.28;

export class IfcThreeViewer {
  constructor({
    rootElement,
    canvasElement,
    infoElement,
    statusElement,
    isolateButton,
    showAllButton,
    hideSelectedButton,
    log,
    logWarning,
  }) {
    this.rootElement = rootElement;
    this.canvasElement = canvasElement;
    this.infoElement = infoElement;
    this.statusElement = statusElement;
    this.isolateButton = isolateButton;
    this.showAllButton = showAllButton;
    this.hideSelectedButton = hideSelectedButton;
    this.log = log;
    this.logWarning = logWarning;

    this.model = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.group = null;
    this.selectionGroup = null;
    this.raycaster = null;
    this.pointer = null;
    this.meshesByStepId = new Map();
    this.modelCenter = { x: 0, y: 0 };
    this.selectedMesh = null;
    this.highlightedStepIds = new Set();
    this.cameraTransition = null;
    this.animationFrameId = null;
    this.initialized = false;
    this.visible = false;

    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.animate = this.animate.bind(this);
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181818);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    this.camera.position.set(8, 8, 8);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvasElement,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, this.canvasElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.group = new THREE.Group();
    this.selectionGroup = new THREE.Group();
    this.scene.add(this.group);
    this.scene.add(this.selectionGroup);

    this.addLights();
    this.addGround();

    this.canvasElement.addEventListener("pointerdown", this.handlePointerDown);
    this.isolateButton?.addEventListener("click", () => this.isolateSelected());
    this.showAllButton?.addEventListener("click", () => this.showAll());
    this.hideSelectedButton?.addEventListener("click", () => this.hideSelected());
    window.addEventListener("resize", this.handleResize);

    this.initialized = true;
    this.updateInfo(null);
  }

  setModel(model) {
    if (this.model === model && this.meshesByStepId.size) {
      return;
    }

    this.model = model;

    if (!this.initialized || !model) {
      return;
    }

    this.clearModel();
    this.modelCenter = getModelCenter(model.modelBounds);
    this.buildModel();
    this.fitCameraToObject(this.group);
    this.updateStatus(`${this.meshesByStepId.size} entidade(s) IFC em 3D`);
    this.log?.("Visualizacao 3D preparada.", {
      entidades: this.meshesByStepId.size,
    });
  }

  show({ focusEntities = [], focusSelection = null } = {}) {
    this.visible = true;
    this.rootElement.hidden = false;
    this.handleResize();
    this.startAnimation();

    if (this.model && !this.meshesByStepId.size) {
      this.setModel(this.model);
    }

    if (focusEntities.length) {
      this.focusEntities(focusEntities);
    } else {
      this.clearFocus();
    }

    this.showSelectionFootprint(focusSelection);
  }

  hide() {
    this.visible = false;
    this.rootElement.hidden = true;
    this.stopAnimation();
  }

  focusEntities(entities) {
    const stepIds = new Set(entities.map((entity) => entity.stepId));

    this.highlightedStepIds = stepIds;

    for (const mesh of this.meshesByStepId.values()) {
      mesh.visible = true;
      this.applyMeshMaterial(mesh);
    }

    const meshes = [...stepIds]
      .map((stepId) => this.meshesByStepId.get(stepId))
      .filter(Boolean);

    if (meshes.length) {
      this.selectMesh(meshes[0]);
      this.fitCameraToObjects(meshes, 1.8);
      this.updateStatus(`${meshes.length} entidade(s) da selecao destacada(s)`);
      return;
    }

    this.selectMesh(null);
    this.updateStatus("Selecao 2D sem geometria IFC 3D correspondente");
  }

  clearFocus() {
    this.highlightedStepIds.clear();
    this.selectedMesh = null;

    for (const mesh of this.meshesByStepId.values()) {
      mesh.visible = true;
      this.applyMeshMaterial(mesh);
    }

    this.updateInfo(null);
    this.updateStatus(`${this.meshesByStepId.size} entidade(s) IFC em 3D`);
  }

  showSelectionFootprint(selection) {
    this.selectionGroup.clear();

    if (!selection?.points?.length) {
      return;
    }

    const points = selection.points.map((point) => ({
      x: (point.x - this.modelCenter.x) * IFC_TO_THREE_SCALE,
      y: -(point.y - this.modelCenter.y) * IFC_TO_THREE_SCALE,
    }));

    if (points.length < 3) {
      return;
    }

    const geometry = createFlatShapeGeometry(points, 0.335);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: HIGHLIGHT_COLOR,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const line = createFootprintLine(points, 0.35, HIGHLIGHT_COLOR);

    this.selectionGroup.add(mesh, line);
  }

  isolateSelected() {
    if (!this.selectedMesh) {
      return;
    }

    for (const mesh of this.meshesByStepId.values()) {
      mesh.visible = mesh === this.selectedMesh;
    }

    this.updateStatus("Entidade isolada no 3D");
  }

  hideSelected() {
    if (!this.selectedMesh) {
      return;
    }

    this.selectedMesh.visible = false;
    this.selectMesh(null);
    this.updateStatus("Entidade ocultada no 3D");
  }

  showAll() {
    for (const mesh of this.meshesByStepId.values()) {
      mesh.visible = true;
    }

    this.updateStatus("Todas as entidades 3D visiveis");
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x343434, 2.2));

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.4);
    directionalLight.position.set(12, 18, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
  }

  addGround() {
    const grid = new THREE.GridHelper(48, 48, 0x3f3f3f, 0x2c2c2c);

    grid.position.y = -0.002;
    this.scene.add(grid);
  }

  clearModel() {
    this.group.clear();
    this.selectionGroup?.clear();
    this.meshesByStepId.clear();
    this.selectedMesh = null;
    this.highlightedStepIds.clear();
  }

  buildModel() {
    const products = this.model.products
      .filter((product) => product.bounds && product.points?.length >= 2)
      .sort((a, b) => a.type.localeCompare(b.type) || a.stepId - b.stepId);

    for (const product of products) {
      const mesh = this.createProductMesh(product);

      if (!mesh) {
        continue;
      }

      this.group.add(mesh);
      this.meshesByStepId.set(product.stepId, mesh);
    }
  }

  createProductMesh(product) {
    const points = normalizeFootprint(product, this.modelCenter);

    if (points.length < 2) {
      return null;
    }

    const group = new THREE.Group();

    group.userData.product = product;
    group.userData.isIfcMesh = true;

    if (product.type === "IFCSPACE") {
      const spaceObjects = createSpaceObjects(product, points, this.modelCenter);

      for (const object of spaceObjects) {
        group.add(object);
      }
    } else {
      const height = (TYPE_HEIGHTS[product.type] || 600) * IFC_TO_THREE_SCALE;
      const geometry =
        points.length >= 3
          ? createExtrudedShapeGeometry(points, height)
          : createBoundsBoxGeometry(product.bounds, height, this.modelCenter);

      if (!geometry) {
        return null;
      }

      const object = new THREE.Mesh(geometry, createProductMaterial(product, 0.92));

      object.userData.baseOpacity = 0.92;
      group.add(object);
    }

    group.userData.baseColor = TYPE_COLORS[product.type] || DEFAULT_COLOR;
    group.userData.baseOpacity = product.type === "IFCSPACE" ? 0.42 : 0.92;

    return group;
  }

  handlePointerDown(event) {
    if (!this.visible || event.button !== 0) {
      return;
    }

    const rect = this.canvasElement.getBoundingClientRect();

    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersections = this.raycaster.intersectObjects(
      [...this.meshesByStepId.values()].filter((mesh) => mesh.visible),
      true,
    );

    this.selectMesh(getSelectableObject(intersections[0]?.object || null));
  }

  selectMesh(mesh) {
    if (this.selectedMesh === mesh) {
      return;
    }

    const previousMesh = this.selectedMesh;
    this.selectedMesh = mesh;

    if (previousMesh) {
      this.applyMeshMaterial(previousMesh);
    }

    if (this.selectedMesh) {
      this.applyMeshMaterial(this.selectedMesh);
    }

    this.updateInfo(this.selectedMesh?.userData.product || null);
  }

  applyMeshMaterial(mesh) {
    const product = mesh.userData.product;
    const isSelected = mesh === this.selectedMesh;
    const isHighlighted = this.highlightedStepIds.has(product.stepId);
    const color = isSelected
      ? SELECTED_COLOR
      : isHighlighted
        ? HIGHLIGHT_COLOR
        : mesh.userData.baseColor;

    mesh.traverse((object) => {
      if (object.isMesh && object.material) {
        object.material.color.setHex(color);
        object.material.opacity =
          isSelected || isHighlighted ? 0.86 : object.userData.baseOpacity;
        object.material.transparent = object.material.opacity < 1;
      }

      if (object.isLine && object.material) {
        object.material.color.setHex(isSelected || isHighlighted ? color : 0xf1d38a);
      }

      if (object.isSprite && object.material) {
        object.visible = isSelected || isHighlighted || product.type === "IFCSPACE";
      }
    });
  }

  fitCameraToObjects(objects, offset = 2.2) {
    const box = new THREE.Box3();

    for (const object of objects) {
      box.expandByObject(object);
    }

    this.fitCameraToBox(box, offset);
  }

  fitCameraToObject(object, offset = 2.4) {
    const box = new THREE.Box3().setFromObject(object);

    this.fitCameraToBox(box, offset);
  }

  fitCameraToBox(box, offset) {
    if (box.isEmpty()) {
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    const distance = maxSize * offset;

    const nextPosition = new THREE.Vector3(
      center.x + distance,
      center.y + distance * 0.9,
      center.z + distance,
    );
    this.camera.near = Math.max(distance / 1000, 0.01);
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();
    this.transitionCamera(nextPosition, center);
  }

  transitionCamera(position, target) {
    this.cameraTransition = {
      startPosition: this.camera.position.clone(),
      endPosition: position.clone(),
      startTarget: this.controls.target.clone(),
      endTarget: target.clone(),
      startTime: performance.now(),
      duration: 450,
    };
  }

  updateCameraTransition() {
    if (!this.cameraTransition) {
      return;
    }

    const elapsed = performance.now() - this.cameraTransition.startTime;
    const progress = Math.min(elapsed / this.cameraTransition.duration, 1);
    const easedProgress = 1 - (1 - progress) ** 3;

    this.camera.position.lerpVectors(
      this.cameraTransition.startPosition,
      this.cameraTransition.endPosition,
      easedProgress,
    );
    this.controls.target.lerpVectors(
      this.cameraTransition.startTarget,
      this.cameraTransition.endTarget,
      easedProgress,
    );

    if (progress >= 1) {
      this.cameraTransition = null;
    }
  }

  handleResize() {
    if (!this.initialized) {
      return;
    }

    const width = this.rootElement.clientWidth || 1;
    const height = this.rootElement.clientHeight || 1;

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  startAnimation() {
    if (this.animationFrameId !== null) {
      return;
    }

    this.animate();
  }

  stopAnimation() {
    if (this.animationFrameId === null) {
      return;
    }

    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }

  animate() {
    if (!this.visible) {
      this.animationFrameId = null;
      return;
    }

    this.updateCameraTransition();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  updateInfo(product) {
    if (!product) {
      this.infoElement.innerHTML = `
        <p>Selecione uma entidade no modelo 3D.</p>
      `;
      this.updateControlState();
      return;
    }

    this.infoElement.innerHTML = `
      <dl>
        <div><dt>Nome</dt><dd>${escapeHtml(getProductDisplayName(product))}</dd></div>
        <div><dt>Tipo</dt><dd>${escapeHtml(product.type)}</dd></div>
        <div><dt>STEP</dt><dd>#${product.stepId}</dd></div>
        <div><dt>GlobalId</dt><dd>${escapeHtml(product.globalId)}</dd></div>
        <div><dt>Identificador</dt><dd>${escapeHtml(product.name || "-")}</dd></div>
        <div><dt>X</dt><dd>${Math.round(product.bounds?.minX || 0)}</dd></div>
        <div><dt>Y</dt><dd>${Math.round(product.bounds?.minY || 0)}</dd></div>
      </dl>
    `;
    this.updateControlState();
  }

  updateStatus(message) {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    }
  }

  updateControlState() {
    const hasSelection = Boolean(this.selectedMesh);

    if (this.isolateButton) {
      this.isolateButton.disabled = !hasSelection;
    }

    if (this.hideSelectedButton) {
      this.hideSelectedButton.disabled = !hasSelection;
    }
  }
}

function normalizeFootprint(product, modelCenter) {
  const sourcePoints = product.points?.length
    ? product.points
    : boundsToPoints(product.bounds);
  const uniquePoints = [];

  for (const point of sourcePoints) {
    const scaledPoint = {
      x: (point.x - modelCenter.x) * IFC_TO_THREE_SCALE,
      y: -(point.y - modelCenter.y) * IFC_TO_THREE_SCALE,
    };
    const previousPoint = uniquePoints[uniquePoints.length - 1];

    if (
      previousPoint &&
      Math.abs(previousPoint.x - scaledPoint.x) < 0.0001 &&
      Math.abs(previousPoint.y - scaledPoint.y) < 0.0001
    ) {
      continue;
    }

    uniquePoints.push(scaledPoint);
  }

  if (uniquePoints.length > 2) {
    const firstPoint = uniquePoints[0];
    const lastPoint = uniquePoints[uniquePoints.length - 1];

    if (
      Math.abs(firstPoint.x - lastPoint.x) < 0.0001 &&
      Math.abs(firstPoint.y - lastPoint.y) < 0.0001
    ) {
      uniquePoints.pop();
    }
  }

  return uniquePoints;
}

function createSpaceObjects(product, points, modelCenter) {
  if (points.length < 3) {
    return [];
  }

  const floorGeometry = createExtrudedShapeGeometry(points, SPACE_FLOOR_HEIGHT);
  const floor = new THREE.Mesh(floorGeometry, createProductMaterial(product, 0.5));
  const outline = createFootprintLine(points, SPACE_LINE_HEIGHT, 0xf1d38a);
  const brepMesh = createBrepMesh(product, modelCenter);
  const label = createSpaceLabel(product, points);

  floor.userData.baseOpacity = 0.5;
  floor.receiveShadow = true;

  return [brepMesh, floor, outline, label].filter(Boolean);
}

function createBrepMesh(product, modelCenter) {
  if (!product.bodyFaces?.length) {
    return null;
  }

  const positions = [];

  for (const face of product.bodyFaces) {
    const points = face.map((point) => toThreePoint(point, modelCenter));

    for (let index = 1; index < points.length - 1; index += 1) {
      positions.push(
        points[0].x,
        points[0].y,
        points[0].z,
        points[index].x,
        points[index].y,
        points[index].z,
        points[index + 1].x,
        points[index + 1].y,
        points[index + 1].z,
      );
    }
  }

  if (!positions.length) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();

  const material = createProductMaterial(product, SPACE_MESH_OPACITY);
  const mesh = new THREE.Mesh(geometry, material);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 22),
    new THREE.LineBasicMaterial({
      color: 0xf4efe2,
      transparent: true,
      opacity: 0.56,
    }),
  );
  const group = new THREE.Group();

  mesh.userData.baseOpacity = SPACE_MESH_OPACITY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  edges.userData.baseOpacity = 0.56;
  group.add(mesh, edges);

  return group;
}

function createExtrudedShapeGeometry(points, height) {
  const shape = new THREE.Shape();

  shape.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) {
    shape.lineTo(point.x, point.y);
  }

  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });

  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  return geometry;
}

function createFlatShapeGeometry(points, height) {
  const shape = new THREE.Shape();

  shape.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) {
    shape.lineTo(point.x, point.y);
  }

  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);

  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, height, 0);

  return geometry;
}

function createBoundsBoxGeometry(bounds, height, modelCenter) {
  if (!bounds) {
    return null;
  }

  const width = Math.max(bounds.width * IFC_TO_THREE_SCALE, 0.02);
  const depth = Math.max(bounds.height * IFC_TO_THREE_SCALE, 0.02);
  const geometry = new THREE.BoxGeometry(width, height, depth);

  geometry.translate(
    (((bounds.minX + bounds.maxX) / 2) - modelCenter.x) * IFC_TO_THREE_SCALE,
    height / 2,
    -(((bounds.minY + bounds.maxY) / 2) - modelCenter.y) * IFC_TO_THREE_SCALE,
  );

  return geometry;
}

function createFootprintLine(points, height, color) {
  const positions = points.map((point) => new THREE.Vector3(point.x, height, point.y));
  const geometry = new THREE.BufferGeometry().setFromPoints([
    ...positions,
    positions[0],
  ]);
  const material = new THREE.LineBasicMaterial({
    color,
    linewidth: 1,
  });

  return new THREE.Line(geometry, material);
}

function createSpaceLabel(product, points) {
  const center = getPointsCenter(points);
  const bodyHeight = Math.max(product.bodyBounds?.maxZ || 2800, 1000);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const label = getProductDisplayName(product);

  canvas.width = 256;
  canvas.height = 96;
  context.fillStyle = "rgba(24, 24, 24, 0.78)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  context.fillStyle = "#f5f1e8";
  context.font = "600 24px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label || `#${product.stepId}`, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);

  sprite.position.set(center.x, bodyHeight * IFC_TO_THREE_SCALE + 0.45, center.y);
  sprite.scale.set(1.6, 0.6, 1);

  return sprite;
}

function createProductMaterial(product, opacity) {
  return new THREE.MeshStandardMaterial({
    color: TYPE_COLORS[product.type] || DEFAULT_COLOR,
    roughness: 0.72,
    metalness: 0.04,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity >= 0.4,
  });
}

function toThreePoint(point, modelCenter) {
  return {
    x: (point.x - modelCenter.x) * IFC_TO_THREE_SCALE,
    y: (point.z || 0) * IFC_TO_THREE_SCALE,
    z: -(point.y - modelCenter.y) * IFC_TO_THREE_SCALE,
  };
}

function getProductDisplayName(product) {
  return [product.name, product.longName || product.objectType]
    .filter(Boolean)
    .join(" - ");
}

function getSelectableObject(object) {
  let currentObject = object;

  while (currentObject) {
    if (currentObject.userData.product) {
      return currentObject;
    }

    currentObject = currentObject.parent;
  }

  return null;
}

function getModelCenter(bounds) {
  if (!bounds) {
    return { x: 0, y: 0 };
  }

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function getPointsCenter(points) {
  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function boundsToPoints(bounds) {
  if (!bounds) {
    return [];
  }

  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
