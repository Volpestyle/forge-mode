import { Document, NodeIO } from "@gltf-transform/core";
import { normals } from "@gltf-transform/functions";
import { Recipe } from "@forge/shared";
import { config } from "../config";

const buildPrompt = (recipe: Recipe) => {
  return `${recipe.name}, ${recipe.style ?? "prototype"}`;
};

const createPlaceholderGlb = async () => {
  const doc = new Document();
  const buffer = doc.createBuffer();

  const positions = new Float32Array([
    -0.5, -0.5, 0.5,
    0.5, -0.5, 0.5,
    0.5, 0.5, 0.5,
    -0.5, 0.5, 0.5,
    -0.5, -0.5, -0.5,
    0.5, -0.5, -0.5,
    0.5, 0.5, -0.5,
    -0.5, 0.5, -0.5
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 2, 3, 0,
    1, 5, 6, 6, 2, 1,
    5, 4, 7, 7, 6, 5,
    4, 0, 3, 3, 7, 4,
    3, 2, 6, 6, 7, 3,
    4, 5, 1, 1, 0, 4
  ]);

  const positionAccessor = doc.createAccessor()
    .setType("VEC3")
    .setArray(positions)
    .setBuffer(buffer);

  const indexAccessor = doc.createAccessor()
    .setArray(indices)
    .setBuffer(buffer);

  const prim = doc.createPrimitive()
    .setAttribute("POSITION", positionAccessor)
    .setIndices(indexAccessor);

  const mesh = doc.createMesh("placeholder").addPrimitive(prim);
  const node = doc.createNode("placeholder").setMesh(mesh);
  doc.getRoot().addChild(node);

  await doc.transform(normals());

  const io = new NodeIO();
  return io.writeBinary(doc);
};

export async function generateMesh(recipe: Recipe) {
  if (!config.llmhub.baseUrl || !config.llmhub.apiKey) {
    return createPlaceholderGlb();
  }

  const provider = config.llmhub.meshProvider ?? config.llmhub.provider;
  try {
    const response = await fetch(`${config.llmhub.baseUrl}${config.llmhub.meshPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llmhub.apiKey}`
      },
      body: JSON.stringify({
        provider,
        model: config.llmhub.meshModel,
        prompt: buildPrompt(recipe)
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LLMHub mesh error ${response.status}: ${detail}`);
    }

    const payload = (await response.json()) as { data?: string; output?: string; glbBase64?: string };
    const base64 = payload.data ?? payload.output ?? payload.glbBase64 ?? "";
    if (!base64) {
      return createPlaceholderGlb();
    }

    return Uint8Array.from(Buffer.from(base64, "base64"));
  } catch (error) {
    return createPlaceholderGlb();
  }
}
