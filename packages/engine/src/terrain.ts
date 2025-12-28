import * as THREE from "three";

export type TerrainOptions = {
  width: number;
  depth: number;
  segmentsX: number;
  segmentsZ: number;
  material?: THREE.Material;
};

export class Terrain {
  readonly width: number;
  readonly depth: number;
  readonly segmentsX: number;
  readonly segmentsZ: number;
  readonly mesh: THREE.Mesh;

  private heights: Float32Array;
  private geometry: THREE.PlaneGeometry;
  private positionAttr: THREE.BufferAttribute;

  constructor(options: TerrainOptions) {
    this.width = options.width;
    this.depth = options.depth;
    this.segmentsX = options.segmentsX;
    this.segmentsZ = options.segmentsZ;

    this.geometry = new THREE.PlaneGeometry(
      this.width,
      this.depth,
      this.segmentsX,
      this.segmentsZ
    );
    this.geometry.rotateX(-Math.PI / 2);

    const material =
      options.material ??
      new THREE.MeshStandardMaterial({
        color: 0x4b5b3e,
        roughness: 1,
        metalness: 0
      });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = true;

    this.positionAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    this.heights = new Float32Array(this.positionAttr.count);

    for (let i = 0; i < this.positionAttr.count; i += 1) {
      this.heights[i] = this.positionAttr.getY(i);
    }
  }

  applyBrush(worldX: number, worldZ: number, delta: number, radius: number) {
    const halfWidth = this.width / 2;
    const halfDepth = this.depth / 2;
    const cellX = this.width / this.segmentsX;
    const cellZ = this.depth / this.segmentsZ;

    const centerX = (worldX + halfWidth) / cellX;
    const centerZ = (worldZ + halfDepth) / cellZ;
    const radiusX = radius / cellX;
    const radiusZ = radius / cellZ;

    const minX = Math.max(0, Math.floor(centerX - radiusX));
    const maxX = Math.min(this.segmentsX, Math.ceil(centerX + radiusX));
    const minZ = Math.max(0, Math.floor(centerZ - radiusZ));
    const maxZ = Math.min(this.segmentsZ, Math.ceil(centerZ + radiusZ));

    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distX = (x - centerX) / radiusX;
        const distZ = (z - centerZ) / radiusZ;
        const distance = Math.sqrt(distX * distX + distZ * distZ);
        if (distance > 1) {
          continue;
        }
        const falloff = 1 - distance;
        const index = z * (this.segmentsX + 1) + x;
        const height = this.heights[index] + delta * falloff;
        this.heights[index] = height;
        this.positionAttr.setY(index, height);
      }
    }

    this.positionAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  sampleHeight(worldX: number, worldZ: number) {
    const halfWidth = this.width / 2;
    const halfDepth = this.depth / 2;
    const normalizedX = (worldX + halfWidth) / this.width;
    const normalizedZ = (worldZ + halfDepth) / this.depth;

    const gridX = normalizedX * this.segmentsX;
    const gridZ = normalizedZ * this.segmentsZ;

    const x0 = Math.max(0, Math.min(this.segmentsX, Math.floor(gridX)));
    const z0 = Math.max(0, Math.min(this.segmentsZ, Math.floor(gridZ)));
    const x1 = Math.max(0, Math.min(this.segmentsX, x0 + 1));
    const z1 = Math.max(0, Math.min(this.segmentsZ, z0 + 1));

    const tx = gridX - x0;
    const tz = gridZ - z0;

    const h00 = this.getHeightAtIndex(x0, z0);
    const h10 = this.getHeightAtIndex(x1, z0);
    const h01 = this.getHeightAtIndex(x0, z1);
    const h11 = this.getHeightAtIndex(x1, z1);

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;

    return h0 * (1 - tz) + h1 * tz;
  }

  private getHeightAtIndex(x: number, z: number) {
    const index = z * (this.segmentsX + 1) + x;
    return this.heights[index] ?? 0;
  }
}
