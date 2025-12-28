import { Recipe } from "./schema";

export type Prefab = {
  prefabId: string;
  name: string;
  recipe: Recipe;
  createdAt: string;
};
