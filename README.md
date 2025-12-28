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
