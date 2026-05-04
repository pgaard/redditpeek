const DEFAULTS = { enabled: true, blockReddit: false };

const enabledEl = document.getElementById("enabled");
const blockEl = document.getElementById("blockReddit");
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
  blockEl.checked = !!stored.blockReddit;
}

enabledEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: enabledEl.checked });
  flashStatus(enabledEl.checked ? "Enabled" : "Disabled");
});

blockEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ blockReddit: blockEl.checked });
  flashStatus(blockEl.checked ? "Blocking Reddit" : "Reddit allowed");
});

load();
