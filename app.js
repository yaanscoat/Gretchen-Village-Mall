// ================= Your server =================
// GitHub Pages can only host files, so the proxy (bare server) and the games
// come from your Cloudflare Worker. Deploy it with `npm run deploy` and put its URL here.
const WORKER_URL = "https://gretchen-village-mall.yawning-yaans.workers.dev";

// If this page is being served by the Worker itself (or `npm run dev`), just use that
const SERVER = location.hostname.endsWith("workers.dev") || location.port === "8787" ? location.origin : WORKER_URL;

// ================= Settings =================
// Everything is saved in the browser so it stays after a refresh
const DEFAULT_SETTINGS = {
  proxy: "uv",
  engine: "duckduckgo",
  theme: "dark",
  disguise: "calculator",
  panicKey: "",
  panicUrl: "https://classroom.google.com",
  code: "0000",
  skipCalc: "no",
};
const settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem("settings") || "{}"));

function saveSettings() {
  localStorage.setItem("settings", JSON.stringify(settings));
  applySettings();
}

const SEARCH_ENGINES = {
  duckduckgo: "https://duckduckgo.com/?q=",
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  brave: "https://search.brave.com/search?q=",
};

const GOOGLE_ICON = "https://www.google.com/s2/favicons?sz=64&domain=";
const DISGUISES = {
  calculator: { title: "Oculus Calculator", icon: "data:," },
  mall: { title: "Gretchen Village Mall", icon: "logo.svg" },
  classroom: { title: "Google Classroom", icon: GOOGLE_ICON + "classroom.google.com" },
  docs: { title: "Google Docs", icon: GOOGLE_ICON + "docs.google.com" },
  drive: { title: "My Drive - Google Drive", icon: GOOGLE_ICON + "drive.google.com" },
  khan: { title: "Khan Academy", icon: GOOGLE_ICON + "khanacademy.org" },
};

// Make the page match the current settings
function applySettings() {
  document.documentElement.dataset.theme = settings.theme;

  const disguise = DISGUISES[settings.disguise];
  document.title = disguise.title;
  document.getElementById("favicon").href = disguise.icon;

  // Highlight the chosen button in each choice group
  document.querySelectorAll(".choices").forEach((group) => {
    group.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.value === settings[group.dataset.setting]);
    });
  });

  document.getElementById("panicKey").value = settings.panicKey;
  document.getElementById("proxyHint").textContent =
    "Using " + (settings.proxy === "uv" ? "Ultraviolet" : "Scramjet") + " - change it in Settings";
}

// Choice buttons (like Ultraviolet / Scramjet)
document.querySelectorAll(".choices").forEach((group) => {
  group.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      settings[group.dataset.setting] = button.dataset.value;
      saveSettings();
    });
  });
});

// Text boxes and dropdowns
document.querySelectorAll("input[data-setting], select[data-setting]").forEach((field) => {
  field.value = settings[field.dataset.setting];
  field.addEventListener("change", () => {
    settings[field.dataset.setting] = field.value.trim() || DEFAULT_SETTINGS[field.dataset.setting];
    field.value = settings[field.dataset.setting];
    saveSettings();
  });
});

// Panic key: click the box, then press any key to choose it
document.getElementById("panicKey").addEventListener("keydown", (event) => {
  event.preventDefault();
  settings.panicKey = event.key === "Backspace" ? "" : event.key;
  saveSettings();
});

document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "INPUT") return;
  if (settings.panicKey && event.key === settings.panicKey) location.href = settings.panicUrl;
});

// about:blank mode: open the mall inside an empty tab
document.getElementById("blankBtn").addEventListener("click", () => {
  const win = window.open("about:blank", "_blank");
  if (!win) return alert("Please allow pop-ups for this site.");
  win.document.title = document.title;
  const frame = win.document.createElement("iframe");
  frame.src = location.origin + SITE_BASE;
  frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:none";
  win.document.body.appendChild(frame);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  localStorage.removeItem("settings");
  location.reload();
});

applySettings();

// ================= Proxy setup =================
// SITE_BASE comes from uv/uv.config.js ("/" or "/your-repo-name/")
const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
  prefix: SITE_BASE + "scramjet/",
  files: {
    wasm: SITE_BASE + "scram/scramjet.wasm.wasm",
    all: SITE_BASE + "scram/scramjet.all.js",
    sync: SITE_BASE + "scram/scramjet.sync.js",
  },
});

const connection = new BareMux.BareMuxConnection(SITE_BASE + "baremux/worker.js");

// Start the service worker, Scramjet, and point both proxies at the Worker's /bare/ server
const ready = (async () => {
  await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  try {
    await scramjet.init();
  } catch {
    // Scramjet's saved data is broken (e.g. from an older version) - wipe it and try again
    await new Promise((done) => {
      const req = indexedDB.deleteDatabase("$scramjet");
      req.onsuccess = req.onerror = req.onblocked = done;
    });
    await scramjet.init();
  }
  await connection.setTransport(location.origin + SITE_BASE + "baremod/index.mjs", [SERVER + "/bare/"]);
})();

// ================= Calculator (landing page) =================
// Turn on "Code mode", type the secret code (0000) and press = to get into the mall
const screen = document.getElementById("screen");
let expression = "";

function showScreen() {
  screen.textContent = expression.replace(/\*/g, "×").replace(/\//g, "÷") || "0";
}

function calculate(text) {
  // Only allow numbers and + - * / . so nothing else can run
  if (!/^[0-9+\-*/.]+$/.test(text)) throw new Error("Bad input");
  const result = Function("return " + text)();
  if (!isFinite(result)) throw new Error("Bad result");
  return String(Math.round(result * 1e10) / 1e10);
}

function unlock() {
  document.getElementById("calc").hidden = true;
  document.getElementById("site").hidden = false;
  showPage("home");
}

function pressKey(key) {
  if (key === "C") {
    expression = "";
  } else if (key === "back") {
    expression = expression.slice(0, -1);
  } else if (key === "=") {
    if (document.getElementById("codeMode").checked && expression === settings.code) return unlock();
    try {
      expression = calculate(expression);
    } catch {
      expression = "";
      screen.textContent = "Error";
      return;
    }
  } else {
    expression += key;
  }
  showScreen();
}

document.querySelectorAll("[data-key]").forEach((button) => {
  button.addEventListener("click", () => pressKey(button.dataset.key));
});

// Typing on the keyboard works too
document.addEventListener("keydown", (event) => {
  if (document.getElementById("calc").hidden) return;
  if ("0123456789+-*/.".includes(event.key)) pressKey(event.key);
  else if (event.key === "Enter" || event.key === "=") pressKey("=");
  else if (event.key === "Backspace") pressKey("back");
  else if (event.key === "Escape") pressKey("C");
  else return;
  event.preventDefault();
});

// ================= Pages (top right icons) =================
let currentPage = "home";

function showPage(name) {
  currentPage = name;
  document.querySelectorAll(".page").forEach((page) => (page.hidden = page.id !== name));
  document.querySelectorAll(".nav-icons button").forEach((b) => b.classList.toggle("active", b.dataset.page === name));

  if (name === "home") document.getElementById("address").focus();
  if (name === "games") loadGames();
  if (name === "movies") {
    const frame = document.getElementById("moviesFrame");
    if (!frame.src) frame.src = "https://helio.yawning-yaans.workers.dev";
  }
}

document.querySelectorAll("[data-page]").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

// ================= Viewer (websites and games) =================
function openViewer(src, label) {
  document.getElementById("frame").src = src;
  document.getElementById("current").textContent = label;
  document.getElementById("site").hidden = true;
  document.getElementById("viewer").hidden = false;
}

document.getElementById("back").addEventListener("click", () => {
  document.getElementById("frame").src = "about:blank";
  document.getElementById("viewer").hidden = true;
  document.getElementById("site").hidden = false;
  showPage(currentPage);
});

document.getElementById("fullscreen").addEventListener("click", () => {
  document.getElementById("frame").requestFullscreen();
});

// ================= Opening websites =================
function toUrl(text) {
  text = text.trim();
  if (/^https?:\/\//.test(text)) return text;
  if (text.includes(".") && !text.includes(" ")) return "https://" + text;
  return SEARCH_ENGINES[settings.engine] + encodeURIComponent(text);
}

async function openSite(text) {
  const url = toUrl(text);
  try {
    await ready;
  } catch (err) {
    document.getElementById("error").textContent = "Proxy failed to start: " + err.message;
    return;
  }

  if (settings.proxy === "uv") {
    openViewer(__uv$config.prefix + __uv$config.encodeUrl(url), url + "  (Ultraviolet)");
  } else {
    openViewer(scramjet.encodeUrl(url), url + "  (Scramjet)");
  }
}

document.getElementById("search").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = document.getElementById("address").value;
  if (text.trim()) openSite(text);
});

document.querySelectorAll("[data-url]").forEach((button) => {
  button.addEventListener("click", () => openSite(button.dataset.url));
});

// ================= Games (gmshelf CKV collection) =================
// The list and covers come straight from jsDelivr. The game pages go through the Worker,
// because jsDelivr sends .html files as plain text and they wouldn't run.
const GAMES_CDN = "https://cdn.jsdelivr.net/gh/gmshelf/ckv@main";
let games = [];

async function loadGames() {
  if (games.length) return;
  const res = await fetch(GAMES_CDN + "/ckv.json");
  games = (await res.json()).games;
  showGames();
}

function showGames() {
  const search = document.getElementById("gameSearch").value.toLowerCase().replace(/\s/g, "");
  const list = document.getElementById("gameList");
  list.innerHTML = "";

  for (const game of games) {
    if (!game.name.toLowerCase().includes(search)) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "game";

    const img = document.createElement("img");
    img.src = GAMES_CDN + game.img;
    img.alt = "";
    img.loading = "lazy";

    const name = document.createElement("span");
    name.textContent = game.name;

    button.append(img, name);
    button.addEventListener("click", () => openViewer(SERVER + game.url, game.name));
    list.appendChild(button);
  }
}

document.getElementById("gameSearch").addEventListener("input", showGames);

// ================= Start =================
if (settings.skipCalc === "yes") unlock();
