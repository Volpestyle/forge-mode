import * as THREE from "three";
import { Terrain } from "./terrain";

export type SimpleRigidBody = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: THREE.Vector3;
  dynamic: boolean;
  mass: number;
  restitution: number;
  friction: number;
  grounded: boolean;
  sleeping: boolean;
};

export class SimplePhysicsWorld {
  private gravity = new THREE.Vector3(0, -9.8, 0);
  private bodies: SimpleRigidBody[] = [];

  addBody(body: SimpleRigidBody) {
    this.bodies.push(body);
  }

  removeBody(body: SimpleRigidBody) {
    this.bodies = this.bodies.filter((existing) => existing !== body);
  }

  step(dt: number, terrain: Terrain) {
    for (const body of this.bodies) {
      if (!body.dynamic || body.sleeping) {
        continue;
      }

      body.velocity.addScaledVector(this.gravity, dt);
      body.position.addScaledVector(body.velocity, dt);

      const groundY = terrain.sampleHeight(body.position.x, body.position.z);
      const minY = groundY + body.size.y;

      if (body.position.y < minY) {
        body.position.y = minY;
        if (Math.abs(body.velocity.y) < 0.5) {
          body.velocity.y = 0;
          body.grounded = true;
        } else {
          body.velocity.y = -body.velocity.y * body.restitution;
          body.grounded = false;
        }
      } else {
        body.grounded = false;
      }

      if (body.grounded) {
        const friction = Math.min(1, body.friction * dt);
        body.velocity.x *= 1 - friction;
        body.velocity.z *= 1 - friction;
      }

      if (body.velocity.lengthSq() < 0.0001) {
        body.sleeping = true;
      } else {
        body.sleeping = false;
      }
    }
  }
}
