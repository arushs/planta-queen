// Client for Planta Queen. Compiled with module: "none" — no imports, so the
// API types are mirrored here as a minimal subset of src/shared/types.ts.

interface ClientPlant {
  id: string;
  name: string;
  photoFilename: string;
  plan: {
    species: string;
    commonName: string;
    wateringIntervalDays: number;
    waterAmountMl: number;
    light: string;
    notes: string;
    confidence: string;
  };
  lastWateredAt: string;
  nextWaterDueAt: string;
  hoursUntilDue: number;
  lastCheckup?: {
    soilMoisture: string;
    healthAssessment: string;
    advice: string;
    checkedAt: string;
  };
}

interface ClientNotification {
  id: string;
  plantId: string;
  message: string;
  createdAt: string;
  read: boolean;
}

const plantsEl = document.getElementById("plants") as HTMLDivElement;
const emptyHintEl = document.getElementById("empty-hint") as HTMLParagraphElement;
const addForm = document.getElementById("add-form") as HTMLFormElement;
const addBtn = document.getElementById("add-btn") as HTMLButtonElement;
const addStatusEl = document.getElementById("add-status") as HTMLParagraphElement;
const notifPanel = document.getElementById("notifications-panel") as HTMLElement;
const notifList = document.getElementById("notifications-list") as HTMLUListElement;
const enableNotifBtn = document.getElementById("enable-notifications") as HTMLButtonElement;

const shownNotificationIds = new Set<string>();

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function dueLabel(hours: number): { text: string; cls: string } {
  if (hours <= 0) {
    const overdueDays = Math.abs(hours) / 24;
    return {
      text: overdueDays >= 1 ? `Overdue by ${overdueDays.toFixed(1)} days — water now!` : "Due now — water it!",
      cls: "due",
    };
  }
  if (hours <= 24) return { text: `Water within ${Math.ceil(hours)} h`, cls: "soon" };
  return { text: `Water in ${(hours / 24).toFixed(1)} days`, cls: "ok" };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch { /* non-JSON error body */ }
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

function renderPlant(plant: ClientPlant): HTMLElement {
  const card = el("div", "card");

  const img = el("img");
  img.src = `/uploads/${plant.photoFilename}`;
  img.alt = plant.name;
  card.appendChild(img);

  const body = el("div", "body");
  body.appendChild(el("h3", undefined, plant.name));
  body.appendChild(
    el("div", "species", `${plant.plan.commonName} · ${plant.plan.species} (${plant.plan.confidence} confidence)`),
  );

  const due = dueLabel(plant.hoursUntilDue);
  body.appendChild(el("div", `status ${due.cls}`, due.text));

  body.appendChild(
    el(
      "div",
      "plan",
      `💧 ${plant.plan.waterAmountMl} ml every ${plant.plan.wateringIntervalDays} days · ☀️ ${plant.plan.light}`,
    ),
  );
  body.appendChild(el("div", "notes", plant.plan.notes));

  if (plant.lastCheckup) {
    const c = plant.lastCheckup;
    body.appendChild(
      el(
        "div",
        "checkup",
        `Last check-in (${new Date(c.checkedAt).toLocaleDateString()}): soil ${c.soilMoisture}. ${c.healthAssessment} ${c.advice}`,
      ),
    );
  }

  const actions = el("div", "actions");

  const waterBtn = el("button", undefined, "I watered it 💦");
  waterBtn.addEventListener("click", async () => {
    waterBtn.disabled = true;
    try {
      await fetchJson(`/api/plants/${plant.id}/water`, { method: "POST" });
      await refreshAll();
    } catch (err) {
      alert(`Could not record watering: ${(err as Error).message}`);
      waterBtn.disabled = false;
    }
  });
  actions.appendChild(waterBtn);

  const checkupBtn = el("button", "secondary", "Check-in photo 📷");
  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    checkupBtn.disabled = true;
    checkupBtn.textContent = "Analyzing…";
    try {
      const form = new FormData();
      form.append("photo", file);
      await fetchJson(`/api/plants/${plant.id}/checkup`, { method: "POST", body: form });
      await refreshAll();
    } catch (err) {
      alert(`Check-in failed: ${(err as Error).message}`);
      checkupBtn.disabled = false;
      checkupBtn.textContent = "Check-in photo 📷";
    }
  });
  checkupBtn.addEventListener("click", () => fileInput.click());
  actions.appendChild(checkupBtn);
  actions.appendChild(fileInput);

  const deleteBtn = el("button", "danger", "Remove");
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Remove ${plant.name}?`)) return;
    try {
      await fetchJson(`/api/plants/${plant.id}`, { method: "DELETE" });
      await refreshAll();
    } catch (err) {
      alert(`Could not remove plant: ${(err as Error).message}`);
    }
  });
  actions.appendChild(deleteBtn);

  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

async function refreshPlants(): Promise<void> {
  const plants = await fetchJson<ClientPlant[]>("/api/plants");
  plantsEl.replaceChildren(...plants.map(renderPlant));
  emptyHintEl.hidden = plants.length > 0;
}

async function refreshNotifications(): Promise<void> {
  const notifications = await fetchJson<ClientNotification[]>("/api/notifications");
  const unread = notifications.filter((n) => !n.read);

  notifPanel.hidden = unread.length === 0;
  notifList.replaceChildren(
    ...unread.map((n) => {
      const li = el("li");
      li.appendChild(el("span", undefined, n.message));
      const time = el("time", undefined, new Date(n.createdAt).toLocaleString());
      li.appendChild(time);
      const dismiss = el("button", "secondary", "Done");
      dismiss.addEventListener("click", async () => {
        await fetchJson("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [n.id] }),
        });
        await refreshNotifications();
      });
      li.appendChild(dismiss);
      return li;
    }),
  );

  // Fire a browser notification once per reminder
  if ("Notification" in window && Notification.permission === "granted") {
    for (const n of unread) {
      if (!shownNotificationIds.has(n.id)) {
        shownNotificationIds.add(n.id);
        new Notification("Planta Queen 🌱", { body: n.message, tag: n.id });
      }
    }
  }
}

async function refreshAll(): Promise<void> {
  await Promise.all([refreshPlants(), refreshNotifications()]);
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  addBtn.disabled = true;
  addStatusEl.textContent = "Analyzing your plant photo — this takes a few seconds…";
  try {
    const form = new FormData(addForm);
    await fetchJson("/api/plants", { method: "POST", body: form });
    addForm.reset();
    addStatusEl.textContent = "Added! Watering plan created from the photo.";
    await refreshAll();
  } catch (err) {
    addStatusEl.textContent = `Failed: ${(err as Error).message}`;
  } finally {
    addBtn.disabled = false;
  }
});

if ("Notification" in window && Notification.permission === "default") {
  enableNotifBtn.hidden = false;
  enableNotifBtn.addEventListener("click", async () => {
    await Notification.requestPermission();
    enableNotifBtn.hidden = true;
  });
}

refreshAll().catch((err) => console.error("Initial load failed:", err));
setInterval(() => refreshNotifications().catch(() => {}), 30_000);
setInterval(() => refreshPlants().catch(() => {}), 5 * 60_000);
