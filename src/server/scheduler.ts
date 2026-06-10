import { Plant, PlantWithStatus } from "../shared/types";
import { listPlants, addNotification, hasUnreadNotificationFor } from "./store";

const CHECK_INTERVAL_MS = 60_000;

export function withStatus(plant: Plant): PlantWithStatus {
  const dueAt =
    new Date(plant.lastWateredAt).getTime() +
    plant.plan.wateringIntervalDays * 24 * 60 * 60 * 1000;
  return {
    ...plant,
    nextWaterDueAt: new Date(dueAt).toISOString(),
    hoursUntilDue: (dueAt - Date.now()) / (60 * 60 * 1000),
  };
}

/**
 * Create a watering notification for every plant that is due and doesn't
 * already have an unread reminder (so reminders don't pile up).
 */
export function checkWateringDue(): void {
  for (const plant of listPlants()) {
    const status = withStatus(plant);
    if (status.hoursUntilDue <= 0 && !hasUnreadNotificationFor(plant.id)) {
      addNotification(
        plant.id,
        `Time to water ${plant.name} (${plant.plan.commonName}) — give it about ${plant.plan.waterAmountMl} ml.`,
      );
    }
  }
}

export function startScheduler(): NodeJS.Timeout {
  checkWateringDue();
  return setInterval(checkWateringDue, CHECK_INTERVAL_MS);
}
