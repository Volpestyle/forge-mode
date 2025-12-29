import { recipeSchema, Recipe } from "@forge/shared";
import { config } from "../config";

const recipeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "name", "scaleMeters"],
  properties: {
    kind: { type: "string", enum: ["prop", "structure", "character", "terrain_stamp"] },
    name: { type: "string" },
    scaleMeters: {
      type: "array",
      items: { type: "number" },
      minItems: 3,
      maxItems: 3
    },
    style: { type: "string" },
    materials: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type"],
        properties: {
          type: { type: "string" },
          roughness: { type: "number", minimum: 0, maximum: 1 },
          metalness: { type: "number", minimum: 0, maximum: 1 },
          color: { type: "string" }
        }
      }
    },
    physics: {
      type: "object",
      additionalProperties: false,
      properties: {
        body: { type: "string", enum: ["static", "dynamic", "kinematic"] },
        massKg: { type: "number", minimum: 0 },
        collider: { type: "string", enum: ["box", "convex_hull", "mesh"] },
        friction: { type: "number", minimum: 0, maximum: 10 },
        restitution: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    interaction: {
      type: "object",
      additionalProperties: false,
      properties: {
        pickup: { type: "boolean" },
        pushable: { type: "boolean" },
        damageable: { type: "boolean" }
      }
    },
    generationPlan: {
      type: "object",
      additionalProperties: false,
      properties: {
        meshStrategy: { type: "string", enum: ["text_to_3d", "image_to_3d", "procedural"] },
        textureStrategy: { type: "string", enum: ["generated_pbr", "pbr_from_image", "flat"] },
        lods: { type: "boolean" }
      }
    }
  }
} as const;

const buildPrompt = (prompt: string, assetType?: Recipe["kind"]) => {
  const typeHint = assetType ? `Asset type: ${assetType}.` : "";
  return [
    "Return ONLY a strict JSON object that matches this example structure:",
    `{\n  \"kind\": \"prop\",\n  \"name\": \"Rusty forklift\",\n  \"scaleMeters\": [2.1, 1.4, 3.2],\n  \"style\": \"semi-realistic, worn paint, industrial\",\n  \"materials\": [\n    { \"type\": \"painted_metal\", \"roughness\": 0.7, \"color\": \"#9a5b4f\" },\n    { \"type\": \"rubber\", \"roughness\": 0.9, \"color\": \"#2b2b2b\" }\n  ],\n  \"physics\": { \"body\": \"dynamic\", \"massKg\": 850, \"collider\": \"convex_hull\" },\n  \"interaction\": { \"pickup\": false, \"pushable\": true },\n  \"generationPlan\": { \"meshStrategy\": \"procedural\", \"textureStrategy\": \"flat\", \"lods\": true }\n}`,
    typeHint,
    `User prompt: ${prompt}`
  ].join("\n");
};

const stripJsonFence = (value: string) =>
  value
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

export async function generateRecipe(prompt: string, assetType?: Recipe["kind"]) {
  if (!config.llmhub.baseUrl || !config.llmhub.apiKey) {
    return null;
  }

  const provider = config.llmhub.intentProvider ?? config.llmhub.provider;
  const response = await fetch(`${config.llmhub.baseUrl}${config.llmhub.intentPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llmhub.apiKey}`
    },
    body: JSON.stringify({
      provider,
      model: config.llmhub.intentModel,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildPrompt(prompt, assetType) }]
        }
      ],
      responseFormat: {
        type: "json_schema",
        jsonSchema: {
          name: "Recipe",
          schema: recipeJsonSchema,
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLMHub error ${response.status}: ${detail}`);
  }

  const payload = (await response.json()) as { text?: string; output?: unknown };
  const raw = typeof payload.text === "string" ? payload.text : payload.output ?? payload;
  const value = typeof raw === "string" ? JSON.parse(stripJsonFence(raw)) : raw;
  const parsed = recipeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("LLMHub response failed recipe schema validation");
  }

  return parsed.data;
}
