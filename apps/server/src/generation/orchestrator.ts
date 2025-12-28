import { nanoid } from "nanoid";
import { AssetDefinition, GenerationJob, Recipe } from "@forge/shared";
import { Store } from "../store/store";
import { RealtimeHub } from "../realtime";
import { generateRecipe } from "./llmhubClient";
import { createMockRecipe } from "./mockRecipe";
import { generateTextures } from "./textureGenerator";

export class GenerationOrchestrator {
  constructor(private store: Store, private realtime: RealtimeHub) {}

  async runJob(job: GenerationJob, assetType?: Recipe["kind"]) {
    job.status = "generating";
    job.attempts += 1;
    await this.store.updateJob(job);
    this.realtime.broadcast({
      type: "job_progress",
      jobId: job.jobId,
      status: job.status,
      progress: 0.2,
      detail: "intent_parse"
    });

    let recipe: Recipe;
    try {
      recipe = (await generateRecipe(job.input.prompt, assetType)) ?? createMockRecipe(job.input.prompt, assetType);
    } catch (error) {
      const fallback = createMockRecipe(job.input.prompt, assetType);
      recipe = fallback;
    }

    this.realtime.broadcast({
      type: "job_progress",
      jobId: job.jobId,
      status: "postprocess",
      progress: 0.7,
      detail: "texture_generation"
    });

    const textures = await generateTextures(recipe);

    const assetId = `asset_${nanoid(8)}`;
    const asset: AssetDefinition = {
      assetId,
      displayName: recipe.name,
      prompt: job.input.prompt,
      generationRecipe: recipe,
      files: {
        textures: [
          {
            type: "albedo",
            url: textures.albedoUrl
          }
        ],
        thumbnailUrl: textures.thumbnailUrl
      },
      tags: [recipe.kind]
    };

    await this.store.createAsset(asset);

    job.status = "ready";
    job.resultAssetId = assetId;
    await this.store.updateJob(job);

    this.realtime.broadcast({
      type: "asset_ready",
      jobId: job.jobId,
      assetId,
      version: 1
    });
  }
}
