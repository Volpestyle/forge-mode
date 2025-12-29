const toNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const config = {
  port: toNumber(process.env.PORT, 8080),
  wsPath: process.env.WS_PATH ?? "/ws",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8080",
  llmhub: {
    baseUrl: process.env.LLMHUB_BASE_URL ?? "",
    apiKey: process.env.LLMHUB_API_KEY ?? "",
    provider: process.env.LLMHUB_PROVIDER ?? "openai",
    intentProvider: process.env.LLMHUB_INTENT_PROVIDER,
    intentModel: process.env.LLMHUB_INTENT_MODEL ?? "text-best",
    intentPath: process.env.LLMHUB_INTENT_PATH ?? "/generate",
    imageProvider: process.env.LLMHUB_IMAGE_PROVIDER,
    imageModel: process.env.LLMHUB_IMAGE_MODEL ?? "image-fast",
    imagePath: process.env.LLMHUB_IMAGE_PATH ?? "/image",
    meshProvider: process.env.LLMHUB_MESH_PROVIDER,
    meshModel: process.env.LLMHUB_MESH_MODEL ?? "3d-quality",
    meshPath: process.env.LLMHUB_MESH_PATH ?? "/mesh"
  },
  storeDriver: process.env.STORE_DRIVER ?? "memory",
  objectStore: process.env.OBJECT_STORE ?? "local"
};
