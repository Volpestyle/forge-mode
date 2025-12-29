import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Terrain } from "./terrain";

export type ColliderType = "box" | "convex_hull" | "mesh";
export type BodyType = "dynamic" | "static" | "kinematic";

type SyncState = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  sleeping: boolean;
  mass: number;
  friction: number;
  restitution: number;
  angularDamping: number;
  bodyType: BodyType;
};

export type SimpleRigidBody = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  size: THREE.Vector3;
  dynamic: boolean;
  mass: number;
  restitution: number;
  friction: number;
  angularDamping: number;
  grounded: boolean;
  sleeping: boolean;
  collider: ColliderType;
  bodyType: BodyType;
  handle: CANNON.Body;
  material: CANNON.Material;
  _sync: SyncState;
  _contactMaterials: Map<number, CANNON.ContactMaterial>;
};

type BodyOptions = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  size: THREE.Vector3;
  dynamic: boolean;
  mass: number;
  restitution: number;
  friction: number;
  angularDamping: number;
  collider?: ColliderType;
  bodyType?: BodyType;
  mesh?: THREE.Object3D;
};

const EPSILON = 1e-4;
const TERRAIN_CONTACT_ID = -1;

const vectorChanged = (a: THREE.Vector3, b: THREE.Vector3) =>
  Math.abs(a.x - b.x) > EPSILON || Math.abs(a.y - b.y) > EPSILON || Math.abs(a.z - b.z) > EPSILON;

const eulerChanged = (a: THREE.Euler, b: THREE.Euler) =>
  Math.abs(a.x - b.x) > EPSILON || Math.abs(a.y - b.y) > EPSILON || Math.abs(a.z - b.z) > EPSILON;

const clampHalfExtents = (size: THREE.Vector3) =>
  new THREE.Vector3(Math.max(0.001, size.x), Math.max(0.001, size.y), Math.max(0.001, size.z));

const toCannonBodyType = (bodyType: BodyType) => {
  switch (bodyType) {
    case "static":
      return CANNON.Body.STATIC;
    case "kinematic":
      return CANNON.Body.KINEMATIC;
    case "dynamic":
    default:
      return CANNON.Body.DYNAMIC;
  }
};

const combineFriction = (a: number, b: number) => Math.max(0, (a + b) * 0.5);
const combineRestitution = (a: number, b: number) => Math.max(0, Math.min(1, (a + b) * 0.5));

const createSyncState = (body: SimpleRigidBody): SyncState => ({
  position: body.position.clone(),
  rotation: body.rotation.clone(),
  velocity: body.velocity.clone(),
  angularVelocity: body.angularVelocity.clone(),
  sleeping: body.sleeping,
  mass: body.mass,
  friction: body.friction,
  restitution: body.restitution,
  angularDamping: body.angularDamping,
  bodyType: body.bodyType
});

const collectGeometryData = (root: THREE.Object3D) => {
  const vertices: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const rootScale = root.scale;
  const temp = new THREE.Vector3();

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const geometry = child.geometry as THREE.BufferGeometry;
    const position = geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!position) {
      return;
    }

    const index = geometry.index;
    const localMatrix = child.matrixWorld.clone().multiply(inverseRoot);

    for (let i = 0; i < position.count; i += 1) {
      temp.fromBufferAttribute(position, i).applyMatrix4(localMatrix);
      temp.set(temp.x * rootScale.x, temp.y * rootScale.y, temp.z * rootScale.z);
      vertices.push(temp.x, temp.y, temp.z);
    }

    if (index) {
      for (let i = 0; i < index.count; i += 1) {
        indices.push(index.getX(i) + vertexOffset);
      }
    } else {
      for (let i = 0; i < position.count; i += 3) {
        indices.push(vertexOffset + i, vertexOffset + i + 1, vertexOffset + i + 2);
      }
    }

    vertexOffset += position.count;
  });

  return { vertices, indices };
};

const createConvexPolyhedron = (mesh: THREE.Object3D) => {
  const { vertices, indices } = collectGeometryData(mesh);
  if (vertices.length < 12 || indices.length < 3) {
    return null;
  }

  const cannonVertices: CANNON.Vec3[] = [];
  for (let i = 0; i < vertices.length; i += 3) {
    cannonVertices.push(new CANNON.Vec3(vertices[i], vertices[i + 1], vertices[i + 2]));
  }

  const faces: number[][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    faces.push([indices[i], indices[i + 1], indices[i + 2]]);
  }

  try {
    return new CANNON.ConvexPolyhedron({ vertices: cannonVertices, faces });
  } catch (error) {
    return null;
  }
};

const createTrimesh = (mesh: THREE.Object3D) => {
  const { vertices, indices } = collectGeometryData(mesh);
  if (vertices.length < 9 || indices.length < 3) {
    return null;
  }
  return new CANNON.Trimesh(vertices, indices);
};

const buildShape = (
  collider: ColliderType,
  size: THREE.Vector3,
  mesh: THREE.Object3D | undefined,
  bodyType: BodyType
): { shape: CANNON.Shape; collider: ColliderType } => {
  let resolvedCollider: ColliderType = collider;
  if (collider === "box" || !mesh) {
    const halfExtents = clampHalfExtents(size);
    return {
      shape: new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)),
      collider: resolvedCollider
    };
  }

  if (collider === "mesh" && bodyType === "dynamic") {
    resolvedCollider = "convex_hull";
  }

  if (resolvedCollider === "convex_hull") {
    const poly = createConvexPolyhedron(mesh);
    if (poly) {
      return { shape: poly, collider: resolvedCollider };
    }
  }

  if (resolvedCollider === "mesh") {
    const trimesh = createTrimesh(mesh);
    if (trimesh) {
      return { shape: trimesh, collider: resolvedCollider };
    }
  }

  const halfExtents = clampHalfExtents(size);
  return {
    shape: new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)),
    collider: "box"
  };
};

export class SimplePhysicsWorld {
  private world: CANNON.World;
  private bodies: SimpleRigidBody[] = [];
  private bodyByHandle = new Map<CANNON.Body, SimpleRigidBody>();
  private terrainBody: CANNON.Body | null = null;
  private terrainMaterial = new CANNON.Material("terrain");
  private fixedTimeStep = 1 / 60;
  private maxSubSteps = 6;

  constructor(terrain?: Terrain) {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.8, 0);
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.4;
    this.world.defaultContactMaterial.restitution = 0.1;

    if (terrain) {
      this.setTerrain(terrain);
    }
  }

  createBody(options: BodyOptions) {
    const bodyType = options.bodyType ?? (options.dynamic ? "dynamic" : "static");
    const material = new CANNON.Material();
    const handle = new CANNON.Body({
      mass: bodyType === "dynamic" ? Math.max(0.001, options.mass) : 0,
      material,
      type: toCannonBodyType(bodyType),
      position: new CANNON.Vec3(options.position.x, options.position.y, options.position.z)
    });

    const rotationQuat = new THREE.Quaternion().setFromEuler(options.rotation);
    handle.quaternion.set(rotationQuat.x, rotationQuat.y, rotationQuat.z, rotationQuat.w);
    handle.angularDamping = options.angularDamping;
    handle.allowSleep = true;

    const shapeResult = buildShape(
      options.collider ?? "box",
      options.size,
      options.mesh,
      bodyType
    );
    handle.addShape(shapeResult.shape);

    const body: SimpleRigidBody = {
      position: options.position.clone(),
      rotation: options.rotation.clone(),
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
      size: options.size.clone(),
      dynamic: bodyType !== "static",
      mass: options.mass,
      restitution: options.restitution,
      friction: options.friction,
      angularDamping: options.angularDamping,
      grounded: false,
      sleeping: false,
      collider: shapeResult.collider,
      bodyType,
      handle,
      material,
      _sync: {} as SyncState,
      _contactMaterials: new Map()
    };

    body._sync = createSyncState(body);
    this.addBody(body);
    return body;
  }

  addBody(body: SimpleRigidBody) {
    if (this.bodies.includes(body)) {
      return;
    }

    this.bodies.push(body);
    this.bodyByHandle.set(body.handle, body);
    this.world.addBody(body.handle);
    this.refreshContactMaterials(body);
  }

  removeBody(body: SimpleRigidBody) {
    this.world.removeBody(body.handle);
    this.bodyByHandle.delete(body.handle);
    this.bodies = this.bodies.filter((existing) => existing !== body);

    for (const [otherId, contact] of Array.from(body._contactMaterials.entries())) {
      this.world.removeContactMaterial(contact);
      body._contactMaterials.delete(otherId);
      if (otherId === TERRAIN_CONTACT_ID) {
        continue;
      }
      for (const other of this.bodies) {
        if (other.material.id === otherId) {
          other._contactMaterials.delete(body.material.id);
          break;
        }
      }
    }
  }

  setTerrain(terrain: Terrain) {
    if (this.terrainBody) {
      this.world.removeBody(this.terrainBody);
      this.terrainBody = null;
    }

    const mesh = terrain.mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!position) {
      return;
    }

    const body = new CANNON.Body({
      mass: 0,
      material: this.terrainMaterial,
      type: CANNON.Body.STATIC
    });

    const cellX = terrain.width / terrain.segmentsX;
    const cellZ = terrain.depth / terrain.segmentsZ;
    const uniformGrid = Math.abs(cellX - cellZ) < 1e-5;

    if (uniformGrid) {
      const columns = terrain.segmentsX + 1;
      const rows = terrain.segmentsZ + 1;
      const data: number[][] = Array.from({ length: columns }, () => new Array(rows).fill(0));

      for (let z = 0; z < rows; z += 1) {
        for (let x = 0; x < columns; x += 1) {
          const index = z * columns + x;
          const flippedZ = rows - 1 - z;
          data[x][flippedZ] = position.getY(index);
        }
      }

      const shape = new CANNON.Heightfield(data, { elementSize: cellX });
      body.addShape(shape);
      body.position.set(-terrain.width / 2, 0, terrain.depth / 2);
      body.quaternion.setFromEuler(-Math.PI / 2, 0, 0, "XYZ");
    } else {
      const index = geometry.index;
      mesh.updateWorldMatrix(true, false);
      const matrix = mesh.matrixWorld;
      const vertices: number[] = [];
      const indices: number[] = [];
      const temp = new THREE.Vector3();

      for (let i = 0; i < position.count; i += 1) {
        temp.fromBufferAttribute(position, i).applyMatrix4(matrix);
        vertices.push(temp.x, temp.y, temp.z);
      }

      if (index) {
        for (let i = 0; i < index.count; i += 1) {
          indices.push(index.getX(i));
        }
      } else {
        for (let i = 0; i < position.count; i += 3) {
          indices.push(i, i + 1, i + 2);
        }
      }

      const shape = new CANNON.Trimesh(vertices, indices);
      body.addShape(shape);
    }

    this.world.addBody(body);
    this.terrainBody = body;

    for (const existing of this.bodies) {
      this.refreshContactMaterials(existing);
    }
  }

  updateTerrain(terrain: Terrain) {
    this.setTerrain(terrain);
  }

  updateBodyCollider(body: SimpleRigidBody, mesh?: THREE.Object3D) {
    const shapeResult = buildShape(body.collider, body.size, mesh, body.bodyType);
    body.collider = shapeResult.collider;

    body.handle.shapes.length = 0;
    body.handle.shapeOffsets.length = 0;
    body.handle.shapeOrientations.length = 0;
    body.handle.addShape(shapeResult.shape);
    body.handle.updateMassProperties();
    body.handle.updateBoundingRadius();
    body.handle.aabbNeedsUpdate = true;
  }

  step(dt: number) {
    for (const body of this.bodies) {
      this.syncBodyToPhysics(body);
    }

    if (dt > 0) {
      this.world.step(this.fixedTimeStep, dt, this.maxSubSteps);
    }

    this.updateGroundedStates();

    for (const body of this.bodies) {
      this.syncBodyFromPhysics(body);
    }
  }

  private refreshContactMaterials(body: SimpleRigidBody) {
    for (const other of this.bodies) {
      if (other === body) {
        continue;
      }
      const contact = this.ensureContactMaterial(body, other);
      contact.friction = combineFriction(body.friction, other.friction);
      contact.restitution = combineRestitution(body.restitution, other.restitution);
    }

    if (this.terrainBody) {
      const contact = this.ensureTerrainContactMaterial(body);
      contact.friction = Math.max(0, body.friction);
      contact.restitution = Math.max(0, Math.min(1, body.restitution));
    }
  }

  private ensureContactMaterial(body: SimpleRigidBody, other: SimpleRigidBody) {
    const idA = body.material.id;
    const idB = other.material.id;

    const existing = body._contactMaterials.get(other.material.id);
    if (existing) {
      return existing;
    }

    const contact = new CANNON.ContactMaterial(body.material, other.material, {
      friction: combineFriction(body.friction, other.friction),
      restitution: combineRestitution(body.restitution, other.restitution)
    });
    this.world.addContactMaterial(contact);
    body._contactMaterials.set(other.material.id, contact);
    other._contactMaterials.set(body.material.id, contact);
    return contact;
  }

  private ensureTerrainContactMaterial(body: SimpleRigidBody) {
    const existing = body._contactMaterials.get(TERRAIN_CONTACT_ID);
    if (existing) {
      return existing;
    }

    const contact = new CANNON.ContactMaterial(body.material, this.terrainMaterial, {
      friction: Math.max(0, body.friction),
      restitution: Math.max(0, Math.min(1, body.restitution))
    });
    this.world.addContactMaterial(contact);
    body._contactMaterials.set(TERRAIN_CONTACT_ID, contact);
    return contact;
  }

  private syncBodyToPhysics(body: SimpleRigidBody) {
    const sync = body._sync;

    if (body.bodyType !== sync.bodyType) {
      body.handle.type = toCannonBodyType(body.bodyType);
      body.handle.mass = body.bodyType === "dynamic" ? Math.max(0.001, body.mass) : 0;
      body.handle.updateMassProperties();
      body.dynamic = body.bodyType !== "static";
      sync.bodyType = body.bodyType;
      sync.mass = body.mass;
    }

    if (body.mass !== sync.mass) {
      body.handle.mass = body.bodyType === "dynamic" ? Math.max(0.001, body.mass) : 0;
      body.handle.updateMassProperties();
      sync.mass = body.mass;
    }

    if (body.angularDamping !== sync.angularDamping) {
      body.handle.angularDamping = body.angularDamping;
      sync.angularDamping = body.angularDamping;
    }

    if (body.friction !== sync.friction || body.restitution !== sync.restitution) {
      this.refreshContactMaterials(body);
      sync.friction = body.friction;
      sync.restitution = body.restitution;
    }

    if (vectorChanged(body.position, sync.position)) {
      body.handle.position.set(body.position.x, body.position.y, body.position.z);
      body.handle.aabbNeedsUpdate = true;
      if (!body.sleeping) {
        body.handle.wakeUp();
      }
      sync.position.copy(body.position);
    }

    if (eulerChanged(body.rotation, sync.rotation)) {
      const quat = new THREE.Quaternion().setFromEuler(body.rotation);
      body.handle.quaternion.set(quat.x, quat.y, quat.z, quat.w);
      body.handle.aabbNeedsUpdate = true;
      if (!body.sleeping) {
        body.handle.wakeUp();
      }
      sync.rotation.copy(body.rotation);
    }

    if (vectorChanged(body.velocity, sync.velocity)) {
      body.handle.velocity.set(body.velocity.x, body.velocity.y, body.velocity.z);
      if (!body.sleeping) {
        body.handle.wakeUp();
      }
      sync.velocity.copy(body.velocity);
    }

    if (vectorChanged(body.angularVelocity, sync.angularVelocity)) {
      body.handle.angularVelocity.set(
        body.angularVelocity.x,
        body.angularVelocity.y,
        body.angularVelocity.z
      );
      if (!body.sleeping) {
        body.handle.wakeUp();
      }
      sync.angularVelocity.copy(body.angularVelocity);
    }

    if (body.sleeping !== sync.sleeping) {
      if (body.sleeping) {
        body.handle.sleep();
      } else {
        body.handle.wakeUp();
      }
      sync.sleeping = body.sleeping;
    }
  }

  private syncBodyFromPhysics(body: SimpleRigidBody) {
    body.position.set(body.handle.position.x, body.handle.position.y, body.handle.position.z);
    body.velocity.set(body.handle.velocity.x, body.handle.velocity.y, body.handle.velocity.z);
    body.angularVelocity.set(
      body.handle.angularVelocity.x,
      body.handle.angularVelocity.y,
      body.handle.angularVelocity.z
    );
    body.rotation.setFromQuaternion(
      new THREE.Quaternion(
        body.handle.quaternion.x,
        body.handle.quaternion.y,
        body.handle.quaternion.z,
        body.handle.quaternion.w
      )
    );
    body.sleeping = body.handle.sleepState === CANNON.Body.SLEEPING;

    body._sync.position.copy(body.position);
    body._sync.velocity.copy(body.velocity);
    body._sync.angularVelocity.copy(body.angularVelocity);
    body._sync.rotation.copy(body.rotation);
    body._sync.sleeping = body.sleeping;
  }

  private updateGroundedStates() {
    for (const body of this.bodies) {
      body.grounded = false;
    }

    if (!this.terrainBody) {
      return;
    }

    const narrowphase = this.world.narrowphase as unknown as {
      contactEquations?: CANNON.ContactEquation[];
    };
    const contacts = narrowphase.contactEquations ?? [];
    for (const contact of contacts) {
      const bodyA = this.bodyByHandle.get(contact.bi);
      const bodyB = this.bodyByHandle.get(contact.bj);

      if (contact.bi === this.terrainBody && bodyB) {
        if (contact.ni.y > 0.5) {
          bodyB.grounded = true;
        }
      } else if (contact.bj === this.terrainBody && bodyA) {
        if (-contact.ni.y > 0.5) {
          bodyA.grounded = true;
        }
      }
    }
  }
}
