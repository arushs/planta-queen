import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { WateringPlan, CheckupResult } from "../shared/types";

const MODEL = "claude-opus-4-8";

const client = new Anthropic();

/**
 * Downscale and re-encode the uploaded photo so it stays well under the
 * API's 5MB image limit and doesn't waste tokens on excess resolution.
 */
async function toApiImage(imageBuffer: Buffer): Promise<string> {
  const resized = await sharp(imageBuffer)
    .rotate() // respect EXIF orientation
    .resize(1568, 1568, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return resized.toString("base64");
}

const WATERING_PLAN_SCHEMA = {
  type: "object",
  properties: {
    species: { type: "string", description: "Botanical species name, best guess" },
    commonName: { type: "string", description: "Common name of the plant" },
    wateringIntervalDays: {
      type: "integer",
      description: "Recommended days between waterings for this plant in this pot, considering species, pot size, and visible conditions",
    },
    waterAmountMl: {
      type: "integer",
      description: "Recommended milliliters of water per watering, scaled to the visible pot size",
    },
    potDiameterCm: { type: "integer", description: "Estimated pot diameter in centimeters from the photo" },
    light: { type: "string", description: "One-sentence light requirement" },
    notes: { type: "string", description: "Two to three sentences of care notes specific to what is visible in the photo" },
    confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in the species identification" },
  },
  required: [
    "species",
    "commonName",
    "wateringIntervalDays",
    "waterAmountMl",
    "potDiameterCm",
    "light",
    "notes",
    "confidence",
  ],
  additionalProperties: false,
} as const;

const CHECKUP_SCHEMA = {
  type: "object",
  properties: {
    soilMoisture: {
      type: "string",
      enum: ["dry", "slightly dry", "moist", "wet", "not visible"],
      description: "Visible soil moisture in the photo",
    },
    healthAssessment: { type: "string", description: "One to two sentences on visible plant health (leaves, color, drooping, pests)" },
    waterNow: { type: "boolean", description: "Whether the plant should be watered right now based on the photo and watering history" },
    wateringIntervalDays: { type: "integer", description: "Updated recommended days between waterings" },
    waterAmountMl: { type: "integer", description: "Updated recommended milliliters per watering" },
    advice: { type: "string", description: "Practical advice for the owner based on the photo" },
  },
  required: ["soilMoisture", "healthAssessment", "waterNow", "wateringIntervalDays", "waterAmountMl", "advice"],
  additionalProperties: false,
} as const;

function extractJson<T>(response: Anthropic.Message): T {
  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  if (!text) throw new Error("Model returned no text content");
  return JSON.parse(text.text) as T;
}

/**
 * Identify the plant from a photo and produce a watering plan
 * (interval + amount) sized to the plant and pot visible in the image.
 */
export async function analyzePlantPhoto(imageBuffer: Buffer): Promise<WateringPlan> {
  const imageData = await toApiImage(imageBuffer);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "You are a houseplant care expert. You identify plants from photos and produce practical watering plans. " +
      "Base the watering amount on the pot size visible in the photo (a rough rule: water volume around 25-33% of pot volume, adjusted for species needs). " +
      "Base the interval on the species, pot size, and any visible conditions (soil, drainage, light in the room). Be realistic, not generic.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageData },
          },
          {
            type: "text",
            text: "Identify this plant and create a watering plan for it as it appears in this photo.",
          },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: WATERING_PLAN_SCHEMA } },
  });

  return extractJson<WateringPlan>(response);
}

/**
 * Re-assess a plant from a fresh photo: read soil moisture and plant health,
 * decide whether to water now, and tune the watering plan.
 */
export async function checkupPlantPhoto(
  imageBuffer: Buffer,
  plan: WateringPlan,
  daysSinceLastWatered: number,
): Promise<CheckupResult> {
  const imageData = await toApiImage(imageBuffer);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "You are a houseplant care expert reviewing a check-in photo of a plant you are already tracking. " +
      "Assess visible soil moisture and plant health, decide if it needs water right now, and adjust the watering plan only if the photo gives a reason to.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/jpeg", data: imageData },
          },
          {
            type: "text",
            text:
              `This is a ${plan.commonName} (${plan.species}). Current plan: water ${plan.waterAmountMl} ml every ` +
              `${plan.wateringIntervalDays} days. It was last watered ${daysSinceLastWatered.toFixed(1)} days ago. `.concat(
                "Assess the photo and update the plan if needed.",
              ),
          },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: CHECKUP_SCHEMA } },
  });

  return extractJson<CheckupResult>(response);
}
