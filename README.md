# 🌱 Planta Queen

A plant tracking app in TypeScript. Snap a photo of a plant and the app:

1. **Identifies it** using Claude's vision API (species + common name).
2. **Builds a watering plan from the picture** — how often to water and *how much* (ml), scaled to the pot size visible in the photo.
3. **Reminds you when it's time to water** — in-app reminders plus browser notifications, each telling you the amount to give.
4. **Check-ins**: upload a fresh photo any time and Claude reads the visible soil moisture and plant health, tells you whether to water right now, and tunes the schedule.

## Stack

- **Backend**: Node.js + Express + TypeScript, JSON-file storage (no database setup needed)
- **Vision/AI**: [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) — Claude Opus 4.8 with adaptive thinking and structured (JSON-schema) outputs
- **Frontend**: vanilla TypeScript compiled with `tsc`, browser Notification API
- **Images**: `sharp` downsizes uploads before they're sent for analysis

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # get one at https://platform.claude.com
npm run dev                            # builds and starts on http://localhost:3000
```

Then open <http://localhost:3000>, click **Enable browser notifications**, and add your first plant.

## How reminders work

A scheduler runs in the server every minute. When `lastWatered + wateringIntervalDays` has passed for a plant, it creates a reminder with the recommended water amount. The page polls for reminders every 30 seconds and surfaces them in-app and as browser notifications. Click **I watered it 💦** to reset the timer (or **Done** to dismiss a reminder).

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/plants` | All plants with due status |
| `POST` | `/api/plants` | Add a plant (`multipart/form-data`: `name`, `photo`) — runs photo analysis |
| `POST` | `/api/plants/:id/water` | Record a watering |
| `POST` | `/api/plants/:id/checkup` | Re-assess from a new photo (`multipart/form-data`: `photo`) |
| `DELETE` | `/api/plants/:id` | Remove a plant |
| `GET` | `/api/notifications` | Reminders, newest first |
| `POST` | `/api/notifications/read` | Mark reminders read (`{ "ids": [...] }`) |

## Project layout

```
src/server/    Express app, store, scheduler, Claude photo analysis
src/client/    Browser app (compiled to public/app.js)
src/shared/    Types shared between API and analysis code
public/        Static frontend
data/          JSON database (created at runtime)
uploads/       Plant photos (created at runtime)
```
