import * as THREE from "three";
import { EngineConfig, InputSnapshot } from "../types";
import { Terrain } from "../terrain";

export class FpsController {
  private yaw = 0;
  private pitch = 0;
  private position: THREE.Vector3;
  private playerHeight: number;

  constructor(startPosition: THREE.Vector3, playerHeight = 1.6) {
    this.position = startPosition.clone();
    this.playerHeight = playerHeight;
  }

  syncFromCamera(camera: THREE.PerspectiveCamera) {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    this.pitch = euler.x;
    this.yaw = euler.y;
    this.position.copy(camera.position);
  }

  update(
    camera: THREE.PerspectiveCamera,
    input: InputSnapshot,
    dt: number,
    config: EngineConfig,
    terrain: Terrain
  ) {
    this.yaw += input.look.x;
    this.pitch = Math.max(
      -config.lookClampRadians,
      Math.min(config.lookClampRadians, this.pitch + input.look.y)
    );

    const speed = config.moveSpeed * (input.sprint ? config.sprintMultiplier : 1);

    const forward = new THREE.Vector3(
      Math.sin(this.yaw),
      0,
      Math.cos(this.yaw)
    );
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

    const move = new THREE.Vector3();
    move.addScaledVector(right, input.move.x);
    move.addScaledVector(forward, input.move.z);

    if (move.lengthSq() > 0) {
      move.normalize();
      this.position.addScaledVector(move, speed * dt);
    }

    const groundY = terrain.sampleHeight(this.position.x, this.position.z);
    camera.position.set(this.position.x, groundY + this.playerHeight, this.position.z);
    camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
