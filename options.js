const DEFAULTS = { enabled: true };

const enabledEl = document.getElementById("enabled");
const statusEl = document.getElementById("status");

let statusTimer = null;
function flashStatus(text) {
  statusEl.textContent = text;
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusEl.textContent = ""; }, 1500);
}

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  enabledEl.checked = !!stored.enabled;
}

enabledEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: enabledEl.checked });
  flashStatus(enabledEl.checked ? "Enabled" : "Disabled");
});

load();
