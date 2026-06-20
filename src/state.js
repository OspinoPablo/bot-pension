// Maneja el ESTADO de cada conversación y la memoria reciente.
//
// Cada chat puede estar en uno de estos modos:
//   AUTO    -> el bot responde normalmente.
//   PENDING -> el bot no supo responder, ya avisó al dueño y espera. (bot callado)
//   MANUAL  -> el dueño está respondiendo en persona en ese chat. (bot callado)
//
// Se guarda en data/state.json para que no se pierda si reinicias el bot.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, "..", "data", "state.json");

let chats = {};

// Carga el estado guardado al arrancar.
try {
  chats = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
} catch {
  chats = {};
}

let saveTimer = null;
function save() {
  // Guarda con un pequeño retraso para no escribir disco en cada mensaje.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(STATE_PATH, JSON.stringify(chats, null, 2));
    } catch (err) {
      console.error("No se pudo guardar el estado:", err.message);
    }
  }, 500);
}

function ensure(chatId) {
  if (!chats[chatId]) {
    chats[chatId] = { mode: "AUTO", lastHumanTs: 0, history: [] };
  }
  return chats[chatId];
}

export function getMode(chatId) {
  return ensure(chatId).mode;
}

export function setMode(chatId, mode) {
  ensure(chatId).mode = mode;
  save();
}

// Registra que el dueño escribió a mano en este chat (para el temporizador).
export function markHuman(chatId) {
  const c = ensure(chatId);
  c.mode = "MANUAL";
  c.lastHumanTs = Date.now();
  save();
}

// Si el chat está MANUAL pero el dueño lleva mucho rato sin escribir,
// el bot vuelve a tomar el control automáticamente.
export function maybeAutoResume(chatId) {
  const c = ensure(chatId);
  if (c.mode === "MANUAL" && Date.now() - c.lastHumanTs > config.autoResumeMs) {
    c.mode = "AUTO";
    save();
    return true;
  }
  return false;
}

export function addHistory(chatId, role, content) {
  const c = ensure(chatId);
  c.history.push({ role, content });
  if (c.history.length > config.historyLimit) {
    c.history = c.history.slice(-config.historyLimit);
  }
  save();
}

export function getHistory(chatId) {
  return ensure(chatId).history;
}

// Lista los chats donde el bot está en pausa (esperando o atendidos por ti),
// ordenados del más reciente al más antiguo.
export function listPaused() {
  return Object.entries(chats)
    .filter(([, c]) => c.mode === "MANUAL" || c.mode === "PENDING")
    .map(([chatId, c]) => ({
      chatId,
      mode: c.mode,
      lastHumanTs: c.lastHumanTs || 0,
    }))
    .sort((a, b) => b.lastHumanTs - a.lastHumanTs);
}
