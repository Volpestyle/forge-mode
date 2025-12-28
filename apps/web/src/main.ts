import * as THREE from "three";
import { createDefaultEngine, createProceduralMesh, EngineMode, Entity } from "@forge/engine";
import { WebInput } from "./input/WebInput";
import { ApiClient } from "./services/apiClient";
import { LocalLibrary } from "./services/library";
import "./style.css";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EntityState, Recipe, SessionServerMessage } from "@forge/shared";
import { SessionClient } from "./services/sessionClient";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app container");
}

const canvas = document.createElement("canvas");
app.appendChild(canvas);

const hud = document.createElement("div");
hud.id = "hud";
app.appendChild(hud);

const ui = document.createElement("div");
ui.id = "ui";
app.appendChild(ui);

const promptPanel = document.createElement("div");
promptPanel.className = "panel";
ui.appendChild(promptPanel);

const queuePanel = document.createElement("div");
queuePanel.className = "panel";
ui.appendChild(queuePanel);

const inspectorPanel = document.createElement("div");
inspectorPanel.className = "panel";
ui.appendChild(inspectorPanel);

const libraryPanel = document.createElement("div");
libraryPanel.className = "panel";
ui.appendChild(libraryPanel);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

const viewport = { width: window.innerWidth, height: window.innerHeight };
renderer.setSize(viewport.width, viewport.height);

const engine = createDefaultEngine(viewport);
const input = new WebInput(canvas);
const library = new LocalLibrary();
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

const apiBase = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ??
  "http://localhost:8080";
const api = new ApiClient(apiBase);
api.connectRealtime();
const roomId = new URLSearchParams(window.location.search).get("room") ?? "room_default";
const sessionClient = new SessionClient(apiBase);
const storedClientId = localStorage.getItem("forge.clientId") ?? undefined;
let sessionClientId: string | null = storedClientId ?? null;
let playerEntityId: string | null = null;
sessionClient.connect(roomId, storedClientId);

const networkEntities = new Map<string, Entity>();
const ownedEntities = new Set<string>();
const lastSentTransforms = new Map<string, THREE.Vector3>();

let mode: EngineMode = "fly";
engine.setMode(mode);
input.setPointerLockEnabled(mode === "fps");

let selected: Entity | null = null;
let meshStrategy: "procedural" | "text_to_3d" | "image_to_3d" = "procedural";

const jobs = new Map<
  string,
  { status: string; entity: Entity | null; assetId?: string; prompt: string; thumbnailUrl?: string }
>();

const updateHud = () => {
  hud.innerHTML = `
    <div class="title">Forge Mode MVP1</div>
    <div class="row"><span class="label">Mode</span> ${mode.toUpperCase()}</div>
    <div class="row">1 Fly · 2 FPS · 3 Sculpt</div>
    <div class="row">WASD move · Space/C up/down · Shift sprint</div>
    <div class="row">Fly: RMB drag to look · FPS: click to lock</div>
    <div class="row">LMB select · FPS: LMB pick/throw</div>
  `;
};
updateHud();

const setMode = (nextMode: EngineMode) => {
  mode = nextMode;
  engine.setMode(mode);
  input.setPointerLockEnabled(mode === "fps");
  updateHud();
};

window.addEventListener("keydown", (event) => {
  if (event.code === "Digit1") {
    setMode("fly");
  }
  if (event.code === "Digit2") {
    setMode("fps");
  }
  if (event.code === "Digit3") {
    setMode("sculpt");
  }
});

canvas.addEventListener("click", () => {
  if (mode === "fps") {
    input.requestPointerLock();
  }
});

const handleResize = () => {
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  renderer.setSize(viewport.width, viewport.height);
  engine.setViewport(viewport.width, viewport.height);
};

window.addEventListener("resize", handleResize);

const getSpawnPosition = () => {
  const forward = new THREE.Vector3();
  engine.camera.getWorldDirection(forward);
  forward.normalize();
  return engine.camera.position.clone().addScaledVector(forward, 6);
};

const findFirstMesh = (object: THREE.Object3D): THREE.Mesh | null => {
  if (object instanceof THREE.Mesh) {
    return object;
  }
  let found: THREE.Mesh | null = null;
  object.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) {
      found = child;
    }
  });
  return found;
};

const applyTextures = (entity: Entity, textures?: Array<{ type: string; url: string }>) => {
  const albedo = textures?.find((entry) => entry.type === "albedo");
  if (!albedo) {
    return;
  }
  textureLoader.load(albedo.url, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const target = findFirstMesh(entity.object);
    if (!target) {
      return;
    }
    const material = target.material as THREE.MeshStandardMaterial;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });
};

const playerRecipe: Recipe = {
  kind: "character",
  name: "Player",
  scaleMeters: [0.8, 1.8, 0.8],
  style: "simple proxy",
  materials: [{ type: "cloth", roughness: 0.9, color: "#5c7c99" }],
  physics: { body: "dynamic", massKg: 90, collider: "box", friction: 4, restitution: 0.1 },
  interaction: { pickup: false, pushable: false },
  generationPlan: { meshStrategy: "procedural", textureStrategy: "flat", lods: false }
};

const applyAssetToEntity = async (entity: Entity, assetId: string) => {
  const asset = await api.getAsset(assetId);
  entity.assetId = asset.assetId;
  entity.recipe = asset.generationRecipe;
  const { mesh } = createProceduralMesh(asset.generationRecipe);
  engine.replaceEntityObject(entity, mesh, { preserveSize: true });
  applyTextures(entity, asset.files?.textures);
  if (asset.files?.glbUrl) {
    gltfLoader.load(asset.files.glbUrl, (gltf) => {
      engine.replaceEntityObject(entity, gltf.scene, { preserveSize: true });
      applyTextures(entity, asset.files?.textures);
    });
  }
};

const spawnEntityFromState = async (state: EntityState) => {
  const position = new THREE.Vector3(
    state.transform.position.x,
    state.transform.position.y,
    state.transform.position.z
  );
  const rotation = new THREE.Euler(
    state.transform.rotation.x,
    state.transform.rotation.y,
    state.transform.rotation.z
  );
  const scale = new THREE.Vector3(
    state.transform.scale.x,
    state.transform.scale.y,
    state.transform.scale.z
  );

  let entity: Entity;
  if (state.assetId === "player_proxy") {
    const recipe = { ...playerRecipe, scaleMeters: [scale.x, scale.y, scale.z] };
    entity = engine.spawnProceduralAsset({ recipe, position, assetId: state.assetId, entityId: state.entityId });
  } else if (state.assetId.startsWith("asset_")) {
    entity = engine.spawnBox({ position, size: scale, color: 0x5b6b72, entityId: state.entityId, assetId: state.assetId });
    await applyAssetToEntity(entity, state.assetId);
  } else {
    entity = engine.spawnBox({ position, size: scale, color: 0x5b6b72, entityId: state.entityId, assetId: state.assetId });
  }

  entity.object.rotation.copy(rotation);
  networkEntities.set(state.entityId, entity);
};

const updateEntityFromState = async (state: EntityState) => {
  const entity = networkEntities.get(state.entityId);
  if (!entity) {
    await spawnEntityFromState(state);
    return;
  }
  if (state.assetId !== entity.assetId && state.assetId.startsWith("asset_")) {
    await applyAssetToEntity(entity, state.assetId);
  }
  engine.applyEntityTransform(entity, {
    position: state.transform.position,
    rotation: state.transform.rotation,
    scale: state.transform.scale
  });
};

const renderPromptPanel = () => {
  promptPanel.innerHTML = "";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Prompt";

  const inputRow = document.createElement("div");
  inputRow.className = "prompt-row";

  const promptInput = document.createElement("input");
  promptInput.placeholder = "Describe an object to spawn...";
  promptInput.className = "prompt-input";

  const meshSelect = document.createElement("select");
  meshSelect.className = "prompt-select";
  meshSelect.innerHTML = `
    <option value="procedural">Procedural</option>
    <option value="text_to_3d">Text to 3D</option>
    <option value="image_to_3d">Image to 3D</option>
  `;
  meshSelect.value = meshStrategy;
  meshSelect.addEventListener("change", () => {
    const next = meshSelect.value as typeof meshStrategy;
    meshStrategy = next;
  });
  const submit = document.createElement("button");
  submit.textContent = "Spawn";
  submit.className = "button";

  submit.addEventListener("click", async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      return;
    }
    promptInput.value = "";
    try {
      const spawn = getSpawnPosition();
      const response = await api.createJob({
        prompt,
        assetType: "prop",
        draft: true,
        clientId: sessionClientId ?? undefined,
        generationPlan: {
          meshStrategy,
          textureStrategy: "generated_pbr",
          lods: true
        },
        spawnTransform: {
          position: { x: spawn.x, y: spawn.y, z: spawn.z },
          rotation: { x: 0, y: engine.camera.rotation.y, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        }
      });
      const placeholderEntity = engine.spawnBox({
        position: spawn,
        size: new THREE.Vector3(...response.placeholder.scaleMeters),
        color: 0x6b7882,
        entityId: response.placeholder.entityId,
        assetId: response.placeholder.assetId
      });
      jobs.set(response.jobId, {
        status: response.status,
        entity: placeholderEntity,
        assetId: response.placeholder.assetId,
        prompt
      });
      ownedEntities.add(response.placeholder.entityId);
      networkEntities.set(response.placeholder.entityId, placeholderEntity);
      sessionClient.spawnEntity(roomId, {
        entityId: response.placeholder.entityId,
        assetId: response.placeholder.assetId,
        ownerId: sessionClientId ?? undefined,
        transform: {
          position: { x: spawn.x, y: spawn.y, z: spawn.z },
          rotation: { x: 0, y: engine.camera.rotation.y, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        physics: {
          mass: placeholderEntity.body.mass,
          friction: placeholderEntity.body.friction,
          restitution: placeholderEntity.body.restitution
        }
      });
      renderQueuePanel();
    } catch (error) {
      alert("Job failed to start");
    }
  });

  inputRow.append(promptInput, meshSelect, submit);
  promptPanel.append(title, inputRow);
};

const renderQueuePanel = () => {
  queuePanel.innerHTML = "";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Generation Queue";
  queuePanel.appendChild(title);

  const list = document.createElement("div");
  list.className = "queue-list";

  for (const [jobId, job] of jobs.entries()) {
    const row = document.createElement("div");
    row.className = "queue-row";
    row.innerHTML = `\n      <div class=\"queue-thumb\">${job.thumbnailUrl ? `<img src=\"${job.thumbnailUrl}\" />` : \"\"}</div>\n      <div class=\"queue-prompt\">${job.prompt}</div>\n      <div class=\"queue-status\">${job.status}</div>\n    `;
    row.addEventListener("click", () => {
      if (job.entity) {
        selected = job.entity;
        renderInspectorPanel();
      }
    });
    list.appendChild(row);
  }

  if (jobs.size === 0) {
    const empty = document.createElement("div");
    empty.className = "queue-empty";
    empty.textContent = "No active jobs yet.";
    list.appendChild(empty);
  }

  queuePanel.appendChild(list);
};

const renderInspectorPanel = () => {
  inspectorPanel.innerHTML = "";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Inspector";
  inspectorPanel.appendChild(title);

  if (!selected) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = "Select an object to edit.";
    inspectorPanel.appendChild(empty);
    return;
  }

  const addField = (label: string, value: number, onChange: (next: number) => void) => {
    const row = document.createElement("div");
    row.className = "field-row";
    const name = document.createElement("label");
    name.textContent = label;
    const inputEl = document.createElement("input");
    inputEl.type = "number";
    inputEl.step = "0.1";
    inputEl.value = value.toFixed(2);
    inputEl.addEventListener("change", () => {
      const next = Number.parseFloat(inputEl.value);
      if (!Number.isNaN(next)) {
        onChange(next);
      }
    });
    row.append(name, inputEl);
    inspectorPanel.appendChild(row);
  };

  const position = selected.object.position;
  const rotation = selected.object.rotation;
  const scale = selected.object.scale;

  addField("Pos X", position.x, (next) => {
    engine.applyEntityTransform(selected!, { position: { x: next, y: position.y, z: position.z } });
  });
  addField("Pos Y", position.y, (next) => {
    engine.applyEntityTransform(selected!, { position: { x: position.x, y: next, z: position.z } });
  });
  addField("Pos Z", position.z, (next) => {
    engine.applyEntityTransform(selected!, { position: { x: position.x, y: position.y, z: next } });
  });
  addField("Rot X", rotation.x, (next) => {
    engine.applyEntityTransform(selected!, { rotation: { x: next, y: rotation.y, z: rotation.z } });
  });
  addField("Rot Y", rotation.y, (next) => {
    engine.applyEntityTransform(selected!, { rotation: { x: rotation.x, y: next, z: rotation.z } });
  });
  addField("Rot Z", rotation.z, (next) => {
    engine.applyEntityTransform(selected!, { rotation: { x: rotation.x, y: rotation.y, z: next } });
  });
  addField("Scale", scale.x, (next) => {
    engine.applyEntityTransform(selected!, { scale: { x: next, y: next, z: next } });
  });

  addField("Mass", selected.body.mass, (next) => {
    engine.applyEntityPhysics(selected!, { mass: next });
  });
  addField("Friction", selected.body.friction, (next) => {
    engine.applyEntityPhysics(selected!, { friction: next });
  });
  addField("Bounce", selected.body.restitution, (next) => {
    engine.applyEntityPhysics(selected!, { restitution: next });
  });

  const saveButton = document.createElement("button");
  saveButton.className = "button secondary";
  saveButton.textContent = "Save to Library";
  saveButton.addEventListener("click", () => {
    if (selected?.recipe) {
      library.add(selected.recipe);
      renderLibraryPanel();
    }
  });
  inspectorPanel.appendChild(saveButton);
};

const renderLibraryPanel = () => {
  libraryPanel.innerHTML = "";
  const title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = "Library";
  libraryPanel.appendChild(title);

  const list = document.createElement("div");
  list.className = "library-list";

  const prefabs = library.list();
  if (prefabs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel-empty";
    empty.textContent = "No saved prefabs.";
    list.appendChild(empty);
  }

  for (const prefab of prefabs) {
    const row = document.createElement("div");
    row.className = "library-row";
    row.innerHTML = `<div>${prefab.name}</div><button class="button tiny">Spawn</button>`;
    const button = row.querySelector("button");
    button?.addEventListener("click", () => {
      const entity = engine.spawnProceduralAsset({
        recipe: prefab.recipe,
        position: getSpawnPosition(),
        assetId: prefab.prefabId
      });
      selected = entity;
      renderInspectorPanel();
    });
    list.appendChild(row);
  }

  libraryPanel.appendChild(list);
};

renderPromptPanel();
renderQueuePanel();
renderInspectorPanel();
renderLibraryPanel();

sessionClient.onMessage(async (message: SessionServerMessage) => {
  if (message.type === "welcome") {
    sessionClientId = message.clientId;
    localStorage.setItem("forge.clientId", message.clientId);
    playerEntityId = `player_${message.clientId}`;
    for (const entity of message.entities) {
      await updateEntityFromState(entity);
    }
  }
  if (message.type === "entity_spawned") {
    await updateEntityFromState(message.entity);
  }
  if (message.type === "entity_updated") {
    const entity = message.entity;
    if (entity.ownerId === sessionClientId && entity.entityId === playerEntityId) {
      if (entity.assetId !== networkEntities.get(entity.entityId)?.assetId) {
        await updateEntityFromState(entity);
      }
      return;
    }
    await updateEntityFromState(entity);
  }
  if (message.type === "entity_removed") {
    const existing = networkEntities.get(message.entityId);
    if (existing) {
      engine.removeEntity(existing);
      networkEntities.delete(message.entityId);
    }
  }
});

api.onEvent(async (event) => {
  if (event.type === "job_progress") {
    const job = jobs.get(event.jobId);
    if (job) {
      job.status = event.status;
      renderQueuePanel();
    }
  }
  if (event.type === "job_failed") {
    const job = jobs.get(event.jobId);
    if (job) {
      job.status = "failed";
      renderQueuePanel();
    }
  }
  if (event.type === "asset_ready") {
    const job = jobs.get(event.jobId);
    if (!job) {
      return;
    }
    const asset = await api.getAsset(event.assetId);
    let entity = job.entity;
    if (!entity) {
      entity = engine.spawnBox({
        position: getSpawnPosition(),
        size: new THREE.Vector3(1, 1, 1),
        color: 0x6b7882,
        entityId: event.entityId,
        assetId: asset.assetId
      });
      networkEntities.set(entity.id, entity);
    }
    await applyAssetToEntity(entity, asset.assetId);
    jobs.set(event.jobId, {
      ...job,
      status: "ready",
      entity,
      assetId: asset.assetId,
      thumbnailUrl: asset.files?.thumbnailUrl
    });
    selected = entity;
    renderQueuePanel();
    renderInspectorPanel();
  }
});

let last = performance.now();
let lastNetworkSync = 0;
const tick = (time: number) => {
  const dt = Math.min(0.033, (time - last) / 1000);
  last = time;

  const snapshot = input.snapshot(viewport);

  if (mode === "fly" && snapshot.pointer.primaryPressed) {
    const hit = engine.pickEntityAtPointer(snapshot.pointer);
    if (hit) {
      selected = hit;
      renderInspectorPanel();
    }
  }

  engine.update(dt, snapshot);
  renderer.render(engine.scene, engine.camera);

  if (sessionClientId && playerEntityId && time - lastNetworkSync > 120) {
    lastNetworkSync = time;
    sessionClient.updateEntity(roomId, playerEntityId, {
      transform: {
        position: {
          x: engine.camera.position.x,
          y: engine.camera.position.y,
          z: engine.camera.position.z
        },
        rotation: {
          x: engine.camera.rotation.x,
          y: engine.camera.rotation.y,
          z: engine.camera.rotation.z
        },
        scale: { x: 1, y: 1, z: 1 }
      }
    });

    for (const entityId of ownedEntities) {
      const entity = networkEntities.get(entityId);
      if (!entity) {
        continue;
      }
      const lastSent = lastSentTransforms.get(entityId);
      const current = entity.object.position.clone();
      if (!lastSent || lastSent.distanceTo(current) > 0.05) {
        lastSentTransforms.set(entityId, current.clone());
        sessionClient.updateEntity(roomId, entityId, {
          transform: {
            position: { x: current.x, y: current.y, z: current.z },
            rotation: {
              x: entity.object.rotation.x,
              y: entity.object.rotation.y,
              z: entity.object.rotation.z
            },
            scale: {
              x: entity.object.scale.x,
              y: entity.object.scale.y,
              z: entity.object.scale.z
            }
          },
          physics: {
            mass: entity.body.mass,
            friction: entity.body.friction,
            restitution: entity.body.restitution
          }
        });
      }
    }
  }

  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);
