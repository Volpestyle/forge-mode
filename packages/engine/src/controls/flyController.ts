import * as THREE from "three";
import { EngineConfig, InputSnapshot } from "../types";

export class FlyController {
  private yaw = 0;
  private pitch = 0;

  syncFromCamera(camera: THREE.PerspectiveCamera) {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    this.pitch = euler.x;
    this.yaw = euler.y;
  }

  update(camera: THREE.PerspectiveCamera, input: InputSnapshot, dt: number, config: EngineConfig) {
    this.yaw += input.look.x;
    this.pitch = Math.max(
      -config.lookClampRadians,
      Math.min(config.lookClampRadians, this.pitch + input.look.y)
    );

    camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");

    const speed = config.moveSpeed * (input.sprint ? config.sprintMultiplier : 1);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const move = new THREE.Vector3();
    move.addScaledVector(right, input.move.x);
    move.addScaledVector(camera.up, input.move.y);
    move.addScaledVector(forward, input.move.z);

    if (move.lengthSq() > 0) {
      move.normalize();
      camera.position.addScaledVector(move, speed * dt);
    }

    if (input.pan.x !== 0 || input.pan.y !== 0) {
      camera.position.addScaledVector(right, input.pan.x);
      camera.position.addScaledVector(up, input.pan.y);
    }

    if (input.zoom !== 0) {
      camera.position.addScaledVector(forward, input.zoom);
    }
  }
}
