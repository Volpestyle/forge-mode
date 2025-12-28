import { Recipe } from "@forge/shared";

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const pickKind = (prompt: string): Recipe["kind"] => {
  const lowered = prompt.toLowerCase();
  if (lowered.includes("character") || lowered.includes("person") || lowered.includes("npc")) {
    return "character";
  }
  if (lowered.includes("terrain") || lowered.includes("hill") || lowered.includes("crater")) {
    return "terrain_stamp";
  }
  if (lowered.includes("building") || lowered.includes("structure") || lowered.includes("house")) {
    return "structure";
  }
  return "prop";
};

export const createMockRecipe = (prompt: string, assetType?: Recipe["kind"]): Recipe => {
  const kind = assetType ?? pickKind(prompt);
  const hash = hashString(prompt);
  const base = 1 + (hash % 3) * 0.5;
  const scale: [number, number, number] =
    kind === "character"
      ? [0.8, 1.8, 0.8]
      : kind === "structure"
      ? [base * 3, base * 2.2, base * 3]
      : kind === "terrain_stamp"
      ? [base * 2, base * 0.6, base * 2]
      : [base, base, base];

  return {
    kind,
    name: prompt.slice(0, 40) || "Generated Object",
    scaleMeters: scale,
    style: "blocky, prototype",
    materials: [
      {
        type: "placeholder",
        roughness: 0.85,
        color: "#b8c6d1"
      }
    ],
    physics: {
      body: kind === "terrain_stamp" ? "static" : "dynamic",
      massKg: kind === "character" ? 90 : 25,
      collider: "box",
      friction: 4,
      restitution: 0.2
    },
    interaction: {
      pickup: kind === "prop",
      pushable: true
    },
    generationPlan: {
      meshStrategy: "procedural",
      textureStrategy: "flat",
      lods: true
    }
  };
};
