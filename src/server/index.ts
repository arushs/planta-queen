import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  initStore,
  listPlants,
  getPlant,
  addPlant,
  updatePlant,
  deletePlant,
  listNotifications,
  addNotification,
  markNotificationsRead,
} from "./store";
import { analyzePlantPhoto, checkupPlantPhoto } from "./analyze";
import { startScheduler, withStatus } from "./scheduler";

const PORT = Number(process.env.PORT ?? 3000);
const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const PUBLIC_DIR = path.join(__dirname, "..", "..", "public");

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
initStore();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  },
});

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOADS_DIR));

function savePhoto(buffer: Buffer): string {
  const filename = `${randomUUID()}.jpg`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return filename;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// --- Plants ---

app.get("/api/plants", (_req, res) => {
  res.json(listPlants().map(withStatus));
});

app.post("/api/plants", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "A plant photo is required." });
    }
    const name = (req.body.name ?? "").trim();
    if (!name) {
      return res.status(400).json({ error: "A plant name is required." });
    }

    const plan = await analyzePlantPhoto(req.file.buffer);
    const photoFilename = savePhoto(req.file.buffer);
    const now = new Date().toISOString();
    const plant = addPlant({
      name,
      photoFilename,
      plan,
      lastWateredAt: now,
      createdAt: now,
    });
    res.status(201).json(withStatus(plant));
  } catch (err) {
    console.error("Failed to analyze plant photo:", err);
    res.status(500).json({ error: `Photo analysis failed: ${errorMessage(err)}` });
  }
});

app.post("/api/plants/:id/water", (req, res) => {
  const plant = updatePlant(req.params.id, { lastWateredAt: new Date().toISOString() });
  if (!plant) return res.status(404).json({ error: "Plant not found." });
  res.json(withStatus(plant));
});

app.post("/api/plants/:id/checkup", upload.single("photo"), async (req, res) => {
  try {
    const plant = getPlant(req.params.id);
    if (!plant) return res.status(404).json({ error: "Plant not found." });
    if (!req.file) return res.status(400).json({ error: "A check-in photo is required." });

    const daysSinceWatered =
      (Date.now() - new Date(plant.lastWateredAt).getTime()) / (24 * 60 * 60 * 1000);
    const result = await checkupPlantPhoto(req.file.buffer, plant.plan, daysSinceWatered);

    const photoFilename = savePhoto(req.file.buffer);
    const updated = updatePlant(plant.id, {
      photoFilename,
      plan: {
        ...plant.plan,
        wateringIntervalDays: result.wateringIntervalDays,
        waterAmountMl: result.waterAmountMl,
      },
      lastCheckup: { ...result, checkedAt: new Date().toISOString() },
    })!;

    if (result.waterNow) {
      addNotification(
        plant.id,
        `${plant.name} looks thirsty (soil: ${result.soilMoisture}) — water it now with about ${result.waterAmountMl} ml.`,
      );
    }
    res.json(withStatus(updated));
  } catch (err) {
    console.error("Checkup failed:", err);
    res.status(500).json({ error: `Checkup failed: ${errorMessage(err)}` });
  }
});

app.delete("/api/plants/:id", (req, res) => {
  if (!deletePlant(req.params.id)) {
    return res.status(404).json({ error: "Plant not found." });
  }
  res.status(204).end();
});

// --- Notifications ---

app.get("/api/notifications", (_req, res) => {
  res.json(listNotifications());
});

app.post("/api/notifications/read", (req, res) => {
  const ids: unknown = req.body?.ids;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
    return res.status(400).json({ error: "Body must be { ids: string[] }." });
  }
  markNotificationsRead(ids);
  res.status(204).end();
});

startScheduler();

app.listen(PORT, () => {
  console.log(`🌱 Planta Queen running at http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn(
      "Warning: no ANTHROPIC_API_KEY set — photo analysis will fail until you provide one.",
    );
  }
});
