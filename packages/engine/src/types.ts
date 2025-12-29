export type EngineMode = "fly" | "fps" | "sculpt";

export type Vec3 = { x: number; y: number; z: number };

export type PointerSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  primaryDown: boolean;
  primaryPressed: boolean;
  primaryReleased: boolean;
  secondaryDown: boolean;
  secondaryPressed: boolean;
  secondaryReleased: boolean;
};

export type InputSnapshot = {
  move: Vec3;
  look: { x: number; y: number };
  pan: { x: number; y: number };
  zoom: number;
  sprint: boolean;
  pointer: PointerSnapshot;
};

export type EngineConfig = {
  moveSpeed: number;
  sprintMultiplier: number;
  lookClampRadians: number;
  holdDistance: number;
  throwStrength: number;
  brushRadius: number;
  brushStrength: number;
};

export const defaultEngineConfig: EngineConfig = {
  moveSpeed: 6,
  sprintMultiplier: 2,
  lookClampRadians: Math.PI / 2 - 0.05,
  holdDistance: 2.2,
  throwStrength: 10,
  brushRadius: 1.8,
  brushStrength: 0.4
};
