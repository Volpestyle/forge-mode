import * as THREE from "three";
import { createDefaultEngine, EngineMode } from "@forge/engine";
import { WebInput } from "./input/WebInput";
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

let mode: EngineMode = "fly";
engine.setMode(mode);
input.setPointerLockEnabled(mode === "fps");

const updateHud = () => {
  hud.innerHTML = `
    <div class="title">Forge Mode MVP0</div>
    <div class="row"><span class="label">Mode</span> ${mode.toUpperCase()}</div>
    <div class="row">1 Fly · 2 FPS · 3 Sculpt</div>
    <div class="row">WASD move · Space/C up/down · Shift sprint</div>
    <div class="row">Fly: RMB drag to look · FPS: click to lock</div>
    <div class="row">LMB pick/throw · Sculpt: LMB raise, RMB lower</div>
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

let last = performance.now();
const tick = (time: number) => {
  const dt = Math.min(0.033, (time - last) / 1000);
  last = time;

  const snapshot = input.snapshot(viewport);
  engine.update(dt, snapshot);
  renderer.render(engine.scene, engine.camera);

  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);
