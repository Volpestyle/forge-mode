import { FastifyInstance } from "fastify";
import { Store } from "../store/store";

export const registerAssetRoutes = (server: FastifyInstance, store: Store) => {
  server.get<{ Params: { assetId: string } }>("/v1/assets/:assetId", async (request, reply) => {
    const asset = await store.getAsset(request.params.assetId);
    if (!asset) {
      return reply.status(404).send({ error: "asset_not_found" });
    }
    return reply.send(asset);
  });

  server.get<{ Params: { assetId: string } }>(
    "/v1/assets/:assetId/download",
    async (request, reply) => {
      const asset = await store.getAsset(request.params.assetId);
      if (!asset) {
        return reply.status(404).send({ error: "asset_not_found" });
      }

      return reply.send({
        assetId: asset.assetId,
        glbUrl: asset.files?.glbUrl ?? null,
        textures: asset.files?.textures ?? [],
        thumbnailUrl: asset.files?.thumbnailUrl ?? null
      });
    }
  );
};
