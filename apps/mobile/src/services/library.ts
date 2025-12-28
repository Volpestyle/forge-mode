import AsyncStorage from "@react-native-async-storage/async-storage";
import { Prefab, Recipe } from "@forge/shared";

const STORAGE_KEY = "forge.prefabs.v1";

export class LocalLibrary {
  private prefabs: Prefab[] = [];

  async load() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.prefabs = [];
      return [];
    }
    try {
      this.prefabs = JSON.parse(raw) as Prefab[];
    } catch {
      this.prefabs = [];
    }
    return [...this.prefabs];
  }

  list() {
    return [...this.prefabs];
  }

  async add(recipe: Recipe) {
    const prefab: Prefab = {
      prefabId: `prefab_${Math.random().toString(36).slice(2, 8)}`,
      name: recipe.name,
      recipe,
      createdAt: new Date().toISOString()
    };
    this.prefabs.unshift(prefab);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefabs));
    return prefab;
  }
}
