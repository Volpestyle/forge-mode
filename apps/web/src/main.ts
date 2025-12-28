import * as THREE from "three";
import { createDefaultEngine, EngineMode, Entity } from "@forge/engine";
import { WebInput } from "./input/WebInput";
import { ApiClient } from "./services/apiClient";
import { LocalLibrary } from "./services/library";
import "./style.css";

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

const apiBase = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ??
  "http://localhost:8080";
const api = new ApiClient(apiBase);
api.connectRealtime();

let mode: EngineMode = "fly";
engine.setMode(mode);
input.setPointerLockEnabled(mode === "fps");

let selected: Entity | null = null;

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

const applyTextures = (entity: Entity, textures?: Array<{ type: string; url: string }>) => {
  const albedo = textures?.find((entry) => entry.type === "albedo");
  if (!albedo) {
    return;
  }
  textureLoader.load(albedo.url, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = entity.mesh.material as THREE.MeshStandardMaterial;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
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
      const response = await api.createJob({
        prompt,
        assetType: "prop",
        draft: true
      });
      const placeholderEntity = engine.spawnBox({
        position: getSpawnPosition(),
        size: new THREE.Vector3(...response.placeholder.scaleMeters),
        color: 0x6b7882
      });
      jobs.set(response.jobId, {
        status: response.status,
        entity: placeholderEntity,
        assetId: response.placeholder.assetId,
        prompt
      });
      renderQueuePanel();
    } catch (error) {
      alert("Job failed to start");
    }
  });

  inputRow.append(promptInput, submit);
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

  const position = selected.mesh.position;
  const rotation = selected.mesh.rotation;
  const scale = selected.mesh.scale;

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
    const position = job.entity?.mesh.position.clone() ?? getSpawnPosition();
    if (job.entity) {
      engine.removeEntity(job.entity);
    }
    const entity = engine.spawnProceduralAsset({
      recipe: asset.generationRecipe,
      position,
      assetId: asset.assetId
    });
    applyTextures(entity, asset.files?.textures);
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

  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);
