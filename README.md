# Forge Mode

Monorepo for the Prompt-to-World sandbox. This milestone ships MVP0 (core sandbox, no AI).

## MVP0 features

- Three.js scene with grid + terrain heightmap
- Fly camera, FPS camera, sculpt mode
- Pick up + throw physics props
- Basic terrain sculpt (raise/lower)
- Web + React Native (Expo GL) clients

## Local setup

```bash
npm install
```

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
