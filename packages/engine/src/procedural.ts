import * as THREE from "three";
import { Recipe } from "@forge/shared";

const kindColor: Record<Recipe["kind"], number> = {
  prop: 0xc2b280,
  structure: 0x8aa3b4,
  character: 0xd6a67a,
  terrain_stamp: 0x5a7b4a
};

const parseColor = (value?: string) => {
  if (!value) {
    return null;
  }
  if (value.startsWith("#")) {
    return Number.parseInt(value.slice(1), 16);
  }
  if (value.startsWith("0x")) {
    return Number.parseInt(value.slice(2), 16);
  }
  return null;
};

export type ProceduralResult = {
  mesh: THREE.Mesh;
  baseHalfSize: THREE.Vector3;
};

export function createProceduralMesh(recipe: Recipe): ProceduralResult {
  const size = new THREE.Vector3(...recipe.scaleMeters);
  let geometry: THREE.BufferGeometry;

  switch (recipe.kind) {
    case "character": {
      const radius = Math.max(0.2, Math.min(size.x, size.z) * 0.5);
      const height = Math.max(0.4, size.y - radius * 2);
      geometry = new THREE.CapsuleGeometry(radius, height, 6, 12);
      break;
    }
    case "terrain_stamp": {
      const radius = Math.max(0.3, Math.max(size.x, size.z) * 0.5);
      geometry = new THREE.CylinderGeometry(radius, radius, Math.max(0.2, size.y), 16);
      break;
    }
    case "structure":
    case "prop":
    default:
      geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      break;
  }

  const materialInput = recipe.materials?.[0];
  const color = parseColor(materialInput?.color) ?? kindColor[recipe.kind];

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: materialInput?.roughness ?? 0.8,
    metalness: materialInput?.metalness ?? 0.1
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;

  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox ?? new THREE.Box3();
  const baseHalfSize = new THREE.Vector3();
  bounds.getSize(baseHalfSize).multiplyScalar(0.5);

  return { mesh, baseHalfSize };
}
