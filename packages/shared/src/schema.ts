import { z } from "zod";

export const materialSchema = z.object({
  type: z.string(),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  color: z.string().optional()
});

export const physicsSchema = z.object({
  body: z.enum(["static", "dynamic", "kinematic"]).default("dynamic"),
  massKg: z.number().positive().optional(),
  collider: z.enum(["box", "convex_hull", "mesh"]).optional(),
  friction: z.number().min(0).max(10).optional(),
  restitution: z.number().min(0).max(1).optional()
});

export const interactionSchema = z.object({
  pickup: z.boolean().optional(),
  pushable: z.boolean().optional(),
  damageable: z.boolean().optional()
});

export const generationPlanSchema = z.object({
  meshStrategy: z.enum(["text_to_3d", "image_to_3d", "procedural"]).default("procedural"),
  textureStrategy: z.enum(["generated_pbr", "pbr_from_image", "flat"]).default("flat"),
  lods: z.boolean().default(true)
});

export const recipeSchema = z.object({
  kind: z.enum(["prop", "structure", "character", "terrain_stamp"]),
  name: z.string(),
  scaleMeters: z.tuple([z.number(), z.number(), z.number()]),
  style: z.string().optional(),
  materials: z.array(materialSchema).optional(),
  physics: physicsSchema.optional(),
  interaction: interactionSchema.optional(),
  generationPlan: generationPlanSchema.optional()
});

export type Recipe = z.infer<typeof recipeSchema>;

export type AssetDefinition = {
  assetId: string;
  displayName: string;
  prompt: string;
  negativePrompt?: string;
  generationRecipe: Recipe;
  providerTrace?: Record<string, unknown>;
  files?: {
    glbUrl?: string;
    textures?: Array<{ type: "albedo" | "normal" | "roughness" | "metallic"; url: string }>;
    thumbnailUrl?: string;
  };
  defaultParams?: Record<string, unknown>;
  tags?: string[];
  license?: Record<string, unknown>;
};

export type GenerationJobStatus =
  | "queued"
  | "generating"
  | "postprocess"
  | "ready"
  | "failed";

export type GenerationJob = {
  jobId: string;
  requestedBy?: string;
  roomId?: string;
  entityId?: string;
  input: {
    prompt: string;
    references?: Array<{ mime: string; url: string }>;
    draft?: boolean;
  };
  status: GenerationJobStatus;
  attempts: number;
  maxAttempts: number;
  timeoutMs?: number;
  lastError?: string | null;
  fallbackPolicy?: "downgrade" | "procedural_only" | "keep_placeholder";
  resultAssetId?: string | null;
};

export type PlaceholderSpawn = {
  assetId: string;
  entityId: string;
  scaleMeters: [number, number, number];
};

export type JobProgressEvent = {
  type: "job_progress";
  jobId: string;
  status: GenerationJobStatus;
  progress: number;
  detail?: string;
};

export type JobFailedEvent = {
  type: "job_failed";
  jobId: string;
  error: string;
  fallbackPolicy?: string;
};

export type AssetReadyEvent = {
  type: "asset_ready";
  jobId: string;
  assetId: string;
  entityId?: string;
  version?: number;
};

export type RealtimeEvent = JobProgressEvent | JobFailedEvent | AssetReadyEvent;

export type JobCreateRequest = {
  roomId?: string;
  clientId?: string;
  prompt: string;
  assetType?: Recipe["kind"];
  generationPlan?: Recipe["generationPlan"];
  references?: Array<{ mime: string; url: string }>;
  draft?: boolean;
  clientRequestId?: string;
  spawnTransform?: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  };
};

export type JobCreateResponse = {
  jobId: string;
  status: GenerationJobStatus;
  placeholder: PlaceholderSpawn;
  fallbackPolicy: "downgrade" | "procedural_only" | "keep_placeholder";
  maxAttempts: number;
};

export type JobStatusResponse = {
  jobId: string;
  status: GenerationJobStatus;
  attempts: number;
  progress?: number;
  resultAssetId?: string | null;
  lastError?: string | null;
};

export type AssetResponse = AssetDefinition;
