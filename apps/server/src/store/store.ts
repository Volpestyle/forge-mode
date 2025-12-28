import { AssetDefinition, GenerationJob } from "@forge/shared";

export type Store = {
  createJob(job: GenerationJob): Promise<void>;
  updateJob(job: GenerationJob): Promise<void>;
  getJob(jobId: string): Promise<GenerationJob | null>;
  createAsset(asset: AssetDefinition): Promise<void>;
  getAsset(assetId: string): Promise<AssetDefinition | null>;
  listJobs(): Promise<GenerationJob[]>;
};
