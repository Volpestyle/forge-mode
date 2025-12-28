import { nanoid } from "nanoid";
import { AssetDefinition, GenerationJob, Recipe } from "@forge/shared";
import { Store } from "../store/store";
import { Storage } from "../storage/storage";
import { RealtimeHub } from "../realtime";
import { SessionManager } from "../multiplayer/sessionManager";
import { generateRecipe } from "./llmhubClient";
import { createMockRecipe } from "./mockRecipe";
import { generateTextures } from "./textureGenerator";
import { generateMesh } from "./meshGenerator";
import { postprocessMesh } from "./postprocess";

export class GenerationOrchestrator {
  constructor(
    private store: Store,
    private realtime: RealtimeHub,
    private storage: Storage,
    private sessions?: SessionManager
  ) {}

  async runJob(
    job: GenerationJob,
    options?: { assetType?: Recipe["kind"]; generationPlan?: Recipe["generationPlan"] }
  ) {
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
      recipe =
        (await generateRecipe(job.input.prompt, options?.assetType)) ??
        createMockRecipe(job.input.prompt, options?.assetType);
    } catch (error) {
      const fallback = createMockRecipe(job.input.prompt, options?.assetType);
      recipe = fallback;
    }

    if (options?.generationPlan) {
      recipe.generationPlan = options.generationPlan;
    }

    this.realtime.broadcast({
      type: "job_progress",
      jobId: job.jobId,
      status: "postprocess",
      progress: 0.7,
      detail: "texture_generation"
    });

    const textures = await generateTextures(recipe);

    const meshStrategy = recipe.generationPlan?.meshStrategy ?? "procedural";
    let glbUrl: string | undefined;

    if (meshStrategy !== "procedural") {
      this.realtime.broadcast({
        type: "job_progress",
        jobId: job.jobId,
        status: "postprocess",
        progress: 0.85,
        detail: "mesh_generation"
      });

      const glbData = await generateMesh(recipe);
      const processed = await postprocessMesh(glbData);
      const upload = await this.storage.putObject({
        key: `meshes/${job.jobId}.glb`,
        data: processed,
        contentType: "model/gltf-binary"
      });
      glbUrl = upload.url;
    }

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
        thumbnailUrl: textures.thumbnailUrl,
        glbUrl
      },
      tags: [recipe.kind]
    };

    await this.store.createAsset(asset);

    job.status = "ready";
    job.resultAssetId = assetId;
    await this.store.updateJob(job);

    if (job.roomId && job.entityId && this.sessions) {
      this.sessions.updateEntityAsset(job.roomId, job.entityId, assetId);
    }

    this.realtime.broadcast({
      type: "asset_ready",
      jobId: job.jobId,
      assetId,
      version: 1
    });
  }
}
