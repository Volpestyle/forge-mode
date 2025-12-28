import * as THREE from "three";
import { FlyController } from "./controls/flyController";
import { FpsController } from "./controls/fpsController";
import { SimplePhysicsWorld, SimpleRigidBody } from "./physics";
import { Terrain } from "./terrain";
import { EngineConfig, EngineMode, InputSnapshot, defaultEngineConfig } from "./types";
import { Recipe } from "@forge/shared";
import { createProceduralMesh } from "./procedural";

export type Entity = {
  id: string;
  assetId?: string;
  name?: string;
  recipe?: Recipe;
  mesh: THREE.Mesh;
  body: SimpleRigidBody;
  baseHalfSize: THREE.Vector3;
  pickupable: boolean;
};

export type EngineOptions = {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  terrain?: Terrain;
  mode?: EngineMode;
  config?: Partial<EngineConfig>;
  viewport: { width: number; height: number };
};

export class Engine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly terrain: Terrain;
  readonly physics: SimplePhysicsWorld;
  readonly entities: Entity[] = [];

  private config: EngineConfig;
  private mode: EngineMode;
  private heldEntity: Entity | null = null;
  private raycaster = new THREE.Raycaster();
  private flyController = new FlyController();
  private fpsController: FpsController;

  constructor(options: EngineOptions) {
    const { viewport } = options;
    this.scene = options.scene ?? new THREE.Scene();
    this.camera =
      options.camera ?? new THREE.PerspectiveCamera(70, viewport.width / viewport.height, 0.1, 200);
    this.terrain =
      options.terrain ?? new Terrain({ width: 60, depth: 60, segmentsX: 80, segmentsZ: 80 });
    this.physics = new SimplePhysicsWorld();
    this.mode = options.mode ?? "fly";
    this.config = { ...defaultEngineConfig, ...options.config };

    this.fpsController = new FpsController(this.camera.position, 1.6);
    this.flyController.syncFromCamera(this.camera);
    this.fpsController.syncFromCamera(this.camera);
  }

  setMode(mode: EngineMode) {
    if (this.mode === mode) {
      return;
    }
    this.mode = mode;
    this.flyController.syncFromCamera(this.camera);
    this.fpsController.syncFromCamera(this.camera);
  }

  getMode() {
    return this.mode;
  }

  setViewport(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  spawnBox(options: { position: THREE.Vector3; size?: THREE.Vector3; color?: number }) {
    const size = options.size ?? new THREE.Vector3(1, 1, 1);
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshStandardMaterial({
      color: options.color ?? 0xc2b280,
      roughness: 0.8,
      metalness: 0.1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;

    const body: SimpleRigidBody = {
      position: options.position.clone(),
      velocity: new THREE.Vector3(),
      size: size.clone().multiplyScalar(0.5),
      dynamic: true,
      mass: 1,
      restitution: 0.2,
      friction: 4,
      grounded: false,
      sleeping: false
    };

    mesh.position.copy(body.position);
    this.scene.add(mesh);
    this.physics.addBody(body);

    const entity: Entity = {
      id: `ent_${Math.random().toString(36).slice(2, 8)}`,
      mesh,
      body,
      baseHalfSize: size.clone().multiplyScalar(0.5),
      pickupable: true
    };

    this.entities.push(entity);
    return entity;
  }

  spawnProceduralAsset(options: {
    recipe: Recipe;
    position: THREE.Vector3;
    assetId?: string;
    entityId?: string;
  }) {
    const { mesh, baseHalfSize } = createProceduralMesh(options.recipe);
    const body: SimpleRigidBody = {
      position: options.position.clone(),
      velocity: new THREE.Vector3(),
      size: baseHalfSize.clone(),
      dynamic: options.recipe.physics?.body !== "static",
      mass: options.recipe.physics?.massKg ?? 1,
      restitution: options.recipe.physics?.restitution ?? 0.2,
      friction: options.recipe.physics?.friction ?? 4,
      grounded: false,
      sleeping: false
    };

    mesh.position.copy(body.position);
    this.scene.add(mesh);
    this.physics.addBody(body);

    const entity: Entity = {
      id: options.entityId ?? `ent_${Math.random().toString(36).slice(2, 8)}`,
      assetId: options.assetId,
      name: options.recipe.name,
      recipe: options.recipe,
      mesh,
      body,
      baseHalfSize,
      pickupable: options.recipe.interaction?.pickup ?? true
    };

    this.entities.push(entity);
    return entity;
  }

  update(dt: number, input: InputSnapshot) {
    if (this.mode === "fps") {
      this.fpsController.update(this.camera, input, dt, this.config, this.terrain);
    } else {
      this.flyController.update(this.camera, input, dt, this.config);
    }

    if (this.mode === "sculpt") {
      this.applySculpt(input, dt);
    } else if (this.mode === "fps") {
      this.handlePickupAndThrow(input);
    }

    this.physics.step(dt, this.terrain);

    for (const entity of this.entities) {
      if (this.heldEntity === entity) {
        continue;
      }
      entity.mesh.position.copy(entity.body.position);
    }
  }

  getEntityById(id: string) {
    return this.entities.find((entity) => entity.id === id) ?? null;
  }

  removeEntity(entity: Entity) {
    this.scene.remove(entity.mesh);
    this.physics.removeBody(entity.body);
    const index = this.entities.indexOf(entity);
    if (index >= 0) {
      this.entities.splice(index, 1);
    }
  }

  pickEntityAtPointer(pointer: InputSnapshot["pointer"], options?: { pickupableOnly?: boolean }) {
    const ray = this.createPointerRay(pointer);
    if (!ray) {
      return null;
    }

    const meshes = this.entities
      .filter((entity) => (options?.pickupableOnly ? entity.pickupable : true))
      .map((entity) => entity.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) {
      return null;
    }

    const hitMesh = hits[0].object;
    return this.entities.find((entity) => entity.mesh === hitMesh) ?? null;
  }

  applyEntityTransform(
    entity: Entity,
    transform: {
      position?: { x: number; y: number; z: number };
      rotation?: { x: number; y: number; z: number };
      scale?: { x: number; y: number; z: number };
    }
  ) {
    if (transform.position) {
      entity.mesh.position.set(transform.position.x, transform.position.y, transform.position.z);
      entity.body.position.copy(entity.mesh.position);
    }
    if (transform.rotation) {
      entity.mesh.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z);
    }
    if (transform.scale) {
      entity.mesh.scale.set(transform.scale.x, transform.scale.y, transform.scale.z);
      entity.body.size
        .copy(entity.baseHalfSize)
        .multiply(new THREE.Vector3(transform.scale.x, transform.scale.y, transform.scale.z));
    }
    entity.body.sleeping = false;
  }

  applyEntityPhysics(
    entity: Entity,
    physics: { mass?: number; friction?: number; restitution?: number }
  ) {
    if (physics.mass !== undefined) {
      entity.body.mass = physics.mass;
    }
    if (physics.friction !== undefined) {
      entity.body.friction = physics.friction;
    }
    if (physics.restitution !== undefined) {
      entity.body.restitution = physics.restitution;
    }
    entity.body.sleeping = false;
  }

  private handlePickupAndThrow(input: InputSnapshot) {
    const pressedThisFrame = input.pointer.primaryPressed;
    if (pressedThisFrame && !this.heldEntity) {
      const picked = this.pickEntity(input);
      if (picked) {
        this.heldEntity = picked;
        picked.body.velocity.set(0, 0, 0);
        picked.body.sleeping = true;
      }
    }

    if (this.heldEntity) {
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.normalize();
      const holdPoint = new THREE.Vector3()
        .copy(this.camera.position)
        .addScaledVector(forward, this.config.holdDistance);

      this.heldEntity.body.position.copy(holdPoint);
      this.heldEntity.mesh.position.copy(holdPoint);
      this.heldEntity.body.velocity.set(0, 0, 0);
    }

    if (input.pointer.primaryReleased && this.heldEntity && !pressedThisFrame) {
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.normalize();
      this.heldEntity.body.sleeping = false;
      this.heldEntity.body.velocity.copy(forward.multiplyScalar(this.config.throwStrength));
      this.heldEntity = null;
    }
  }

  private applySculpt(input: InputSnapshot, dt: number) {
    const pointer = input.pointer;
    if (!pointer.primaryDown && !pointer.secondaryDown) {
      return;
    }

    const hit = this.intersectTerrain(pointer);
    if (!hit) {
      return;
    }

    const direction = pointer.primaryDown ? 1 : -1;
    const delta = direction * this.config.brushStrength * dt;
    this.terrain.applyBrush(hit.x, hit.z, delta, this.config.brushRadius);
  }

  private pickEntity(input: InputSnapshot) {
    return this.pickEntityAtPointer(input.pointer, { pickupableOnly: true });
  }

  private intersectTerrain(pointer: InputSnapshot["pointer"]) {
    const ray = this.createPointerRay(pointer);
    if (!ray) {
      return null;
    }

    const hits = this.raycaster.intersectObject(this.terrain.mesh, false);
    if (hits.length === 0) {
      return null;
    }

    return hits[0].point;
  }

  private createPointerRay(pointer: InputSnapshot["pointer"]) {
    if (pointer.width <= 0 || pointer.height <= 0) {
      return null;
    }

    const ndc = new THREE.Vector2(
      (pointer.x / pointer.width) * 2 - 1,
      -(pointer.y / pointer.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }
}

export function createDefaultEngine(viewport: { width: number; height: number }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bb6c8);

  const camera = new THREE.PerspectiveCamera(70, viewport.width / viewport.height, 0.1, 200);
  camera.position.set(0, 8, 14);

  const terrain = new Terrain({ width: 60, depth: 60, segmentsX: 80, segmentsZ: 80 });

  const engine = new Engine({ scene, camera, terrain, viewport });

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;

  const grid = new THREE.GridHelper(60, 60, 0x2f3a2f, 0x2f3a2f);
  grid.position.y = 0.02;

  scene.add(ambient, sun, terrain.mesh, grid);

  for (let i = 0; i < 6; i += 1) {
    engine.spawnBox({
      position: new THREE.Vector3(-6 + i * 2.2, 4 + Math.random() * 2, -2 + Math.random() * 3),
      size: new THREE.Vector3(1, 1, 1),
      color: 0xb8c6d1
    });
  }

  return engine;
}
