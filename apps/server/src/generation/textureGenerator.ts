import { Recipe } from "@forge/shared";
import { config } from "../config";

const makeTexturePrompt = (recipe: Recipe) => {
  const style = recipe.style ? `, ${recipe.style}` : "";
  return `Seamless texture for ${recipe.name}${style}, PBR albedo only.`;
};

const makeThumbnailPrompt = (recipe: Recipe) => {
  return `Thumbnail render of ${recipe.name}, studio lighting, centered.`;
};

const toDataUrl = (mime: string, data: string) => {
  if (data.startsWith("data:")) {
    return data;
  }
  return `data:${mime};base64,${data}`;
};

const fallbackTexture = (color: string, label: string) => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" />
      <stop offset="100%" stop-color="#111111" />
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#g)" />
  <text x="128" y="140" text-anchor="middle" font-size="24" fill="#ffffff" font-family="Arial">${label}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const safeColor = (recipe: Recipe) => {
  const color = recipe.materials?.[0]?.color ?? "#6b7882";
  if (color.startsWith("#") || color.startsWith("0x")) {
    return color;
  }
  return "#6b7882";
};

export async function generateTextures(recipe: Recipe) {
  const fallbackColor = safeColor(recipe);

  if (!config.llmhub.baseUrl || !config.llmhub.apiKey) {
    return {
      albedoUrl: fallbackTexture(fallbackColor, "ALBEDO"),
      thumbnailUrl: fallbackTexture(fallbackColor, "THUMB")
    };
  }

  const callImage = async (prompt: string) => {
    const response = await fetch(`${config.llmhub.baseUrl}${config.llmhub.imagePath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llmhub.apiKey}`
      },
      body: JSON.stringify({
        model: config.llmhub.imageModel,
        prompt,
        size: "1K"
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`LLMHub image error ${response.status}: ${detail}`);
    }

    const payload = (await response.json()) as { mime?: string; data?: string; output?: string };
    const mime = payload.mime ?? "image/png";
    const data = payload.data ?? payload.output ?? "";
    return toDataUrl(mime, data);
  };

  try {
    const [albedoUrl, thumbnailUrl] = await Promise.all([
      callImage(makeTexturePrompt(recipe)),
      callImage(makeThumbnailPrompt(recipe))
    ]);
    return { albedoUrl, thumbnailUrl };
  } catch (error) {
    return {
      albedoUrl: fallbackTexture(fallbackColor, "ALBEDO"),
      thumbnailUrl: fallbackTexture(fallbackColor, "THUMB")
    };
  }
}
