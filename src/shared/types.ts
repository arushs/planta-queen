export interface WateringPlan {
  /** Botanical species name, e.g. "Monstera deliciosa" */
  species: string;
  /** Common name, e.g. "Swiss cheese plant" */
  commonName: string;
  /** Recommended days between waterings */
  wateringIntervalDays: number;
  /** Recommended amount of water per watering, in milliliters */
  waterAmountMl: number;
  /** Estimated pot diameter in centimeters, from the photo */
  potDiameterCm: number;
  /** Light requirements summary */
  light: string;
  /** Free-form care notes */
  notes: string;
  /** Identification confidence: high | medium | low */
  confidence: string;
}

export interface CheckupResult {
  /** Visible soil moisture assessment: dry | slightly dry | moist | wet | not visible */
  soilMoisture: string;
  /** Overall plant health assessment from the photo */
  healthAssessment: string;
  /** Whether the plant should be watered right now */
  waterNow: boolean;
  /** Updated days between waterings (may match the previous plan) */
  wateringIntervalDays: number;
  /** Updated water amount in milliliters (may match the previous plan) */
  waterAmountMl: number;
  /** Advice for the owner based on what is visible in the photo */
  advice: string;
}

export interface Plant {
  id: string;
  name: string;
  photoFilename: string;
  plan: WateringPlan;
  /** ISO timestamp of the last watering (or creation time) */
  lastWateredAt: string;
  createdAt: string;
  lastCheckup?: CheckupResult & { checkedAt: string };
}

export interface AppNotification {
  id: string;
  plantId: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface PlantWithStatus extends Plant {
  nextWaterDueAt: string;
  /** Negative = overdue by that many hours */
  hoursUntilDue: number;
}
