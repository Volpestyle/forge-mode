import { Prefab, Recipe } from "@forge/shared";

const STORAGE_KEY = "forge.prefabs.v1";

const loadPrefabs = (): Prefab[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as Prefab[];
  } catch {
    return [];
  }
};

const savePrefabs = (prefabs: Prefab[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefabs));
};

export class LocalLibrary {
  private prefabs = loadPrefabs();

  list() {
    return [...this.prefabs];
  }

  add(recipe: Recipe) {
    const prefab: Prefab = {
      prefabId: `prefab_${Math.random().toString(36).slice(2, 8)}`,
      name: recipe.name,
      recipe,
      createdAt: new Date().toISOString()
    };
    this.prefabs.unshift(prefab);
    savePrefabs(this.prefabs);
    return prefab;
  }
}
