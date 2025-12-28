import { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { GenerationJob, JobCreateRequest, JobCreateResponse, JobStatusResponse } from "@forge/shared";
import { GenerationOrchestrator } from "../generation/orchestrator";
import { Store } from "../store/store";

export const registerJobRoutes = (
  server: FastifyInstance,
  store: Store,
  orchestrator: GenerationOrchestrator
) => {
  server.post<{ Body: JobCreateRequest }>("/v1/jobs", async (request, reply) => {
    const payload = request.body;
    const jobId = `job_${nanoid(8)}`;
    const placeholder = {
      assetId: `asset_proxy_${nanoid(6)}`,
      entityId: `ent_${nanoid(6)}`,
      scaleMeters: payload.generationPlan?.lods ? [1, 1, 1] : [1, 1, 1]
    } as const;

    const job: GenerationJob = {
      jobId,
      requestedBy: undefined,
      roomId: payload.roomId,
      input: {
        prompt: payload.prompt,
        references: payload.references,
        draft: payload.draft
      },
      status: "queued",
      attempts: 0,
      maxAttempts: 2,
      lastError: null,
      fallbackPolicy: "downgrade",
      resultAssetId: null
    };

    await store.createJob(job);

    orchestrator.runJob(job, payload.assetType).catch((error) => {
      void error;
    });

    const response: JobCreateResponse = {
      jobId,
      status: job.status,
      placeholder,
      fallbackPolicy: job.fallbackPolicy ?? "downgrade",
      maxAttempts: job.maxAttempts
    };

    return reply.send(response);
  });

  server.get<{ Params: { jobId: string } }>("/v1/jobs/:jobId", async (request, reply) => {
    const job = await store.getJob(request.params.jobId);
    if (!job) {
      return reply.status(404).send({ error: "job_not_found" });
    }

    const response: JobStatusResponse = {
      jobId: job.jobId,
      status: job.status,
      attempts: job.attempts,
      progress: job.status === "ready" ? 1 : job.status === "generating" ? 0.5 : 0.2,
      resultAssetId: job.resultAssetId ?? null,
      lastError: job.lastError ?? null
    };

    return reply.send(response);
  });

  server.post<{ Params: { jobId: string } }>("/v1/jobs/:jobId/cancel", async (request, reply) => {
    const job = await store.getJob(request.params.jobId);
    if (!job) {
      return reply.status(404).send({ error: "job_not_found" });
    }

    job.status = "failed";
    job.lastError = "cancelled";
    await store.updateJob(job);
    return reply.send({ ok: true });
  });

  server.post<{ Params: { jobId: string } }>("/v1/jobs/:jobId/retry", async (request, reply) => {
    const job = await store.getJob(request.params.jobId);
    if (!job) {
      return reply.status(404).send({ error: "job_not_found" });
    }
    if (job.attempts >= job.maxAttempts) {
      return reply.status(400).send({ error: "max_attempts_reached" });
    }

    job.status = "queued";
    job.lastError = null;
    await store.updateJob(job);

    orchestrator.runJob(job).catch((error) => {
      void error;
    });

    return reply.send({ ok: true });
  });
};
