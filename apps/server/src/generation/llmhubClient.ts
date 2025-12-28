import { recipeSchema, Recipe } from "@forge/shared";
import { config } from "../config";

const buildPrompt = (prompt: string, assetType?: Recipe["kind"]) => {
  const typeHint = assetType ? `Asset type: ${assetType}.` : "";
  return [
    "Return ONLY a strict JSON object that matches this example structure:",
    `{\n  \"kind\": \"prop\",\n  \"name\": \"Rusty forklift\",\n  \"scaleMeters\": [2.1, 1.4, 3.2],\n  \"style\": \"semi-realistic, worn paint, industrial\",\n  \"materials\": [\n    { \"type\": \"painted_metal\", \"roughness\": 0.7, \"color\": \"#9a5b4f\" },\n    { \"type\": \"rubber\", \"roughness\": 0.9, \"color\": \"#2b2b2b\" }\n  ],\n  \"physics\": { \"body\": \"dynamic\", \"massKg\": 850, \"collider\": \"convex_hull\" },\n  \"interaction\": { \"pickup\": false, \"pushable\": true },\n  \"generationPlan\": { \"meshStrategy\": \"procedural\", \"textureStrategy\": \"flat\", \"lods\": true }\n}`,
    typeHint,
    `User prompt: ${prompt}`
  ].join("\n");
};

export async function generateRecipe(prompt: string, assetType?: Recipe["kind"]) {
  if (!config.llmhub.baseUrl || !config.llmhub.apiKey) {
    return null;
  }

  const response = await fetch(`${config.llmhub.baseUrl}${config.llmhub.intentPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llmhub.apiKey}`
    },
    body: JSON.stringify({
      model: config.llmhub.intentModel,
      prompt: buildPrompt(prompt, assetType),
      response_format: "json"
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLMHub error ${response.status}: ${detail}`);
  }

  const payload = (await response.json()) as { json?: unknown; output?: unknown };
  const raw = payload.json ?? payload.output ?? payload;
  const parsed = recipeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("LLMHub response failed recipe schema validation");
  }

  return parsed.data;
}
