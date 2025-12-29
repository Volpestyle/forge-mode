import { InputSnapshot } from "@forge/engine";

export class WebInput {
  private element: HTMLElement;
  private keys = new Set<string>();
  private pointer = {
    x: 0,
    y: 0,
    primaryDown: false,
    secondaryDown: false
  };
  private look = { x: 0, y: 0 };
  private pan = { x: 0, y: 0 };
  private zoom = 0;
  private primaryPressed = false;
  private primaryReleased = false;
  private secondaryPressed = false;
  private secondaryReleased = false;
  private rightDown = false;
  private pointerLocked = false;
  private pointerLockEnabled = false;
  private sensitivity = 0.002;
  private panSensitivity = 0.01;
  private zoomSensitivity = 0.06;
  private primaryLookEnabled = true;

  constructor(element: HTMLElement) {
    this.element = element;
    this.element.tabIndex = 0;
    this.element.addEventListener("mousedown", this.handleMouseDown);
    this.element.addEventListener("mouseup", this.handleMouseUp);
    this.element.addEventListener("mousemove", this.handleMouseMove);
    this.element.addEventListener("wheel", this.handleWheel, { passive: false });
    this.element.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
  }

  setPointerLockEnabled(enabled: boolean) {
    this.pointerLockEnabled = enabled;
  }

  setPrimaryLookEnabled(enabled: boolean) {
    this.primaryLookEnabled = enabled;
  }

  requestPointerLock() {
    if (!this.pointerLockEnabled) {
      return;
    }
    if (document.pointerLockElement !== this.element) {
      this.element.requestPointerLock();
    }
  }

  snapshot(viewport: { width: number; height: number }): InputSnapshot {
    const moveX = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const moveZ = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const moveY = (this.keys.has("Space") ? 1 : 0) - (this.keys.has("KeyC") ? 1 : 0);
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");

    const pointerX = this.pointerLocked ? viewport.width / 2 : this.pointer.x;
    const pointerY = this.pointerLocked ? viewport.height / 2 : this.pointer.y;

    const snapshot: InputSnapshot = {
      move: { x: moveX, y: moveY, z: moveZ },
      look: { x: this.look.x, y: this.look.y },
      pan: { x: this.pan.x, y: this.pan.y },
      zoom: this.zoom,
      sprint,
      pointer: {
        x: pointerX,
        y: pointerY,
        width: viewport.width,
        height: viewport.height,
        primaryDown: this.pointer.primaryDown,
        primaryPressed: this.primaryPressed,
        primaryReleased: this.primaryReleased,
        secondaryDown: this.pointer.secondaryDown,
        secondaryPressed: this.secondaryPressed,
        secondaryReleased: this.secondaryReleased
      }
    };

    this.look.x = 0;
    this.look.y = 0;
    this.pan.x = 0;
    this.pan.y = 0;
    this.zoom = 0;
    this.primaryPressed = false;
    this.primaryReleased = false;
    this.secondaryPressed = false;
    this.secondaryReleased = false;

    return snapshot;
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    this.keys.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    this.keys.delete(event.code);
  };

  private handleMouseDown = (event: MouseEvent) => {
    if (event.button === 0) {
      this.pointer.primaryDown = true;
      this.primaryPressed = true;
    }
    if (event.button === 2) {
      this.pointer.secondaryDown = true;
      this.secondaryPressed = true;
      this.rightDown = true;
    }
    if (this.pointerLockEnabled) {
      this.requestPointerLock();
    }
  };

  private handleMouseUp = (event: MouseEvent) => {
    if (event.button === 0) {
      this.pointer.primaryDown = false;
      this.primaryReleased = true;
    }
    if (event.button === 2) {
      this.pointer.secondaryDown = false;
      this.secondaryReleased = true;
      this.rightDown = false;
    }
  };

  private handleMouseMove = (event: MouseEvent) => {
    const rect = this.element.getBoundingClientRect();
    this.pointer.x = event.clientX - rect.left;
    this.pointer.y = event.clientY - rect.top;

    const primaryLook = this.pointer.primaryDown && this.primaryLookEnabled;
    if (this.pointerLocked || this.rightDown || primaryLook) {
      this.look.x -= event.movementX * this.sensitivity;
      this.look.y -= event.movementY * this.sensitivity;
    }
  };

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    const deltaX = event.deltaX * scale;
    const deltaY = event.deltaY * scale;
    if (event.ctrlKey) {
      this.zoom += -deltaY * this.zoomSensitivity;
    } else {
      this.pan.x += -deltaX * this.panSensitivity;
      this.pan.y += -deltaY * this.panSensitivity;
    }
  };

  private handlePointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.element;
  };
}
