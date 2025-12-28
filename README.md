# Forge Mode

Monorepo for the Prompt-to-World sandbox. MVP1 adds prompt-to-recipe jobs and a local prefab library.

## MVP0 features

- Three.js scene with grid + terrain heightmap
- Fly camera, FPS camera, sculpt mode
- Pick up + throw physics props
- Basic terrain sculpt (raise/lower)
- Web + React Native (Expo GL) clients

## MVP1 features

- Prompt -> structured recipe (LLMHub or mock) -> procedural spawn
- Generation job queue + realtime events (WebSocket)
- Inspector edits and local prefab library

## MVP2 features

- Texture + thumbnail generation (LLMHub image or SVG fallback)
- Automatic texture application to procedural meshes

## MVP3 features

- Text-to-3D mesh generation (LLMHub mesh or placeholder GLB fallback)
- GLB storage via local object store (served from `/storage`)
- Client-side GLB streaming + replacement

## MVP4 features

- WebSocket session server (`/session`) with rooms + entity replication
- Server-coordinated assetId swaps on job completion
- Basic player presence syncing

## Local setup

```bash
npm install
```

## Run server (MVP1)

```bash
npm run dev:engine
npm run dev:server
```

Environment (optional):
- `LLMHUB_BASE_URL`
- `LLMHUB_API_KEY`
- `LLMHUB_INTENT_MODEL`
- `LLMHUB_INTENT_PATH`
- `LLMHUB_IMAGE_MODEL`
- `LLMHUB_IMAGE_PATH`
- `LLMHUB_MESH_MODEL`
- `LLMHUB_MESH_PATH`
- `PUBLIC_BASE_URL` (defaults to `http://localhost:8080`)
- `OBJECT_STORE` (defaults to `local`)

## Run web

```bash
npm run dev:engine
npm run dev:web
```

Controls (web):
- `1` Fly, `2` FPS, `3` Sculpt
- WASD move, Space/C up/down, Shift sprint
- Fly: RMB drag to look
- FPS: click to lock pointer
- LMB pick/throw, Sculpt: LMB raise, RMB lower
- Multiplayer room: add `?room=room_123` to the URL

## Run mobile (Expo)

```bash
npm run dev:engine
npm run dev:mobile
```

Controls (mobile):
- Left pad: move
- Right pad: look / pick / sculpt
- Buttons: Up/Down/Sprint and Lower (for sculpt)

Set `EXPO_PUBLIC_API_BASE` to point at the server (default: `http://localhost:8080`).
