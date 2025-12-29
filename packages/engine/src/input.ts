import { InputSnapshot } from "./types";

export const createEmptyInput = (): InputSnapshot => ({
  move: { x: 0, y: 0, z: 0 },
  look: { x: 0, y: 0 },
  pan: { x: 0, y: 0 },
  zoom: 0,
  sprint: false,
  pointer: {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    primaryDown: false,
    primaryPressed: false,
    primaryReleased: false,
    secondaryDown: false,
    secondaryPressed: false,
    secondaryReleased: false
  }
});
