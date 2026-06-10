import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Plant, AppNotification } from "../shared/types";

interface Database {
  plants: Plant[];
  notifications: AppNotification[];
}

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

let db: Database = { plants: [], notifications: [] };

export function initStore(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
      db.plants ??= [];
      db.notifications ??= [];
    } catch {
      // Corrupt db file — keep a backup and start fresh rather than crash
      fs.renameSync(DB_PATH, `${DB_PATH}.corrupt-${Date.now()}`);
      db = { plants: [], notifications: [] };
    }
  }
}

function persist(): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function listPlants(): Plant[] {
  return db.plants;
}

export function getPlant(id: string): Plant | undefined {
  return db.plants.find((p) => p.id === id);
}

export function addPlant(plant: Omit<Plant, "id">): Plant {
  const created: Plant = { id: randomUUID(), ...plant };
  db.plants.push(created);
  persist();
  return created;
}

export function updatePlant(id: string, patch: Partial<Plant>): Plant | undefined {
  const plant = getPlant(id);
  if (!plant) return undefined;
  Object.assign(plant, patch);
  persist();
  return plant;
}

export function deletePlant(id: string): boolean {
  const before = db.plants.length;
  db.plants = db.plants.filter((p) => p.id !== id);
  db.notifications = db.notifications.filter((n) => n.plantId !== id);
  persist();
  return db.plants.length < before;
}

export function listNotifications(): AppNotification[] {
  return [...db.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addNotification(plantId: string, message: string): AppNotification {
  const notification: AppNotification = {
    id: randomUUID(),
    plantId,
    message,
    createdAt: new Date().toISOString(),
    read: false,
  };
  db.notifications.push(notification);
  persist();
  return notification;
}

export function hasUnreadNotificationFor(plantId: string): boolean {
  return db.notifications.some((n) => n.plantId === plantId && !n.read);
}

export function markNotificationsRead(ids: string[]): void {
  for (const n of db.notifications) {
    if (ids.includes(n.id)) n.read = true;
  }
  persist();
}
