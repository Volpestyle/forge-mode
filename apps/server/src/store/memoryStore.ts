import { AssetDefinition, GenerationJob } from "@forge/shared";
import { Store } from "./store";

export class MemoryStore implements Store {
  private jobs = new Map<string, GenerationJob>();
  private assets = new Map<string, AssetDefinition>();

  async createJob(job: GenerationJob) {
    this.jobs.set(job.jobId, job);
  }

  async updateJob(job: GenerationJob) {
    this.jobs.set(job.jobId, job);
  }

  async getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null;
  }

  async createAsset(asset: AssetDefinition) {
    this.assets.set(asset.assetId, asset);
  }

  async getAsset(assetId: string) {
    return this.assets.get(assetId) ?? null;
  }

  async listJobs() {
    return Array.from(this.jobs.values());
  }
}
