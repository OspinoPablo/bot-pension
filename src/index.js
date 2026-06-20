// ============================================================
//  BOT DE WHATSAPP PARA LA PENSIÓN
//  - Responde dudas usando IA + tu FAQ (no inventa).
//  - Si no sabe, te avisa (a tu chat personal) y se calla en ese chat.
//  - Si TÚ respondes a un cliente desde tu celular, el bot detecta que
//    entraste y se calla solo en ese chat.
//  - El CONTROL (reactivar el bot) se hace desde tu CHAT DE AVISOS con
//    comandos, para que el cliente nunca vea nada.
// ============================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";

import { config } from "./config.js";
import { think, noSabe, getFaqText, setFaqText } from "./brain.js";
import { startServer } from "./server.js";
import {
  getMode,
  setMode,
  markHuman,
  maybeAutoResume,
  addHistory,
  getHistory,
  listPaused,
} from "./state.js";

// Chat donde llegan los avisos y donde escribes los comandos de control.
// Es una estimación inicial; al conectarse (evento "ready") se normaliza con el
// identificador EXACTO que usa WhatsApp, para que los comandos siempre coincidan.
let adminChatId = config.adminNumber ? `${config.adminNumber}@c.us` : null;

// IDs de mensajes que ENVÍA el bot (para no confundirlos con los tuyos a mano).
const botSentIds = new Set();

// Textos que el bot está enviando. Sirve para reconocer sus propios mensajes
// cuando el evento llega ANTES de que alcancemos a guardar su ID (carrera).
const pendingBotTexts = [];

// Última lista mostrada con /estado, para que "/bot 2" sepa a qué chat se refiere.
let ultimaLista = [];

// Estado para el panel web.
let estadoBot = "iniciando"; // "iniciando" | "qr" | "conectado" | "desconectado"
let qrDataUrl = null; // imagen del QR mientras no esté conectado
let miNumero = null; // número del bot (se llena al conectar)

// Carpetas de sesión de WhatsApp (se borran solas si cierras sesión).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIRS = [
  path.join(__dirname, "..", ".wwebjs_auth"),
  path.join(__dirname, "..", ".wwebjs_cache"),
];
let limpiandoSesion = false; // evita limpiar dos veces a la vez

const client = new Client({
  authStrategy: new LocalAuth(), // guarda la sesión: solo escaneas el QR una vez
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// Envía un mensaje y recuerda su ID (para no confundirlo con uno tuyo manual).
async function botSend(chatId, text) {
  // Registrar el texto ANTES de enviar (clave para evitar la condición de carrera).
  pendingBotTexts.push({ text, ts: Date.now() });
  // Limpiar registros de más de 30s para no acumular memoria.
  const ahora = Date.now();
  while (pendingBotTexts.length && ahora - pendingBotTexts[0].ts > 30000) {
    pendingBotTexts.shift();
  }
  const msg = await client.sendMessage(chatId, text);
  if (msg?.id?._serialized) botSentIds.add(msg.id._serialized);
  return msg;
}

// Devuelve un nombre legible del contacto (nombre o número) para mostrártelo a ti.
async function nombreDe(chatId) {
  try {
    const c = await client.getContactById(chatId);
    const num = c.number ? `+${c.number}` : "";
    const nom = c.pushname || c.name || c.shortName || "";
    return (nom ? `${nom} ${num}` : num).trim() || chatId;
  } catch {
    return chatId;
  }
}

// Avisa al dueño (en su chat personal) de una duda sin responder.
async function avisarDueno(chatId, pregunta) {
  if (!adminChatId) {
    console.log("ℹ️  (Configura ADMIN_NUMBER en .env para recibir avisos)");
    return;
  }
  const nombre = await nombreDe(chatId);
  const aviso =
    `🔔 *Duda sin responder*\n\n` +
    `Cliente: ${nombre}\n` +
    `Preguntó: "${pregunta}"\n\n` +
    `Abre ese chat y respóndele tú. El bot se quedará callado ahí mientras lo atiendes.\n\n` +
    `Cuando termines, escribe *aquí* (no en el chat del cliente):\n` +
    `• */bot* → reactiva el último chat que atendiste\n` +
    `• */estado* → ver todos los chats en pausa`;
  await botSend(adminChatId, aviso);
}

// Procesa los comandos que escribes en TU chat de avisos.
async function manejarComandoAdmin(texto) {
  const lower = texto.toLowerCase().trim();

  // Ver la lista de chats en pausa.
  if (lower === "/estado" || lower === "/chats") {
    const pausados = listPaused();
    ultimaLista = pausados.map((p) => p.chatId);
    if (pausados.length === 0) {
      await botSend(adminChatId, "✅ No hay chats en pausa. El bot está atendiendo todo.");
      return;
    }
    const lineas = await Promise.all(
      pausados.map(async (p, i) => {
        const nombre = await nombreDe(p.chatId);
        const estado = p.mode === "PENDING" ? "duda sin responder" : "lo atiendes tú";
        return `${i + 1}. ${nombre} — ${estado}`;
      })
    );
    await botSend(
      adminChatId,
      "💬 *Chats en pausa:*\n" +
        lineas.join("\n") +
        "\n\nPara reactivar el bot escribe: */bot <número>*\n" +
        "Ejemplo: /bot 1   (o */bot all* para todos)"
    );
    return;
  }

  // Reactivar el bot en uno o varios chats.
  if (lower === "/bot" || lower.startsWith("/bot ")) {
    const arg = lower.slice(4).trim();
    const pausados = listPaused();
    if (pausados.length === 0) {
      await botSend(adminChatId, "No hay chats en pausa.");
      return;
    }
    let objetivos = [];
    if (arg === "all") {
      objetivos = pausados.map((p) => p.chatId);
    } else if (arg === "") {
      objetivos = [pausados[0].chatId]; // el más reciente que atendiste
    } else {
      const n = parseInt(arg, 10);
      const lista = ultimaLista.length ? ultimaLista : pausados.map((p) => p.chatId);
      const chatId = lista[n - 1];
      if (!Number.isInteger(n) || !chatId) {
        await botSend(adminChatId, "Número inválido. Escribe /estado para ver la lista.");
        return;
      }
      objetivos = [chatId];
    }
    objetivos.forEach((id) => setMode(id, "AUTO"));
    const nombres = await Promise.all(objetivos.map(nombreDe));
    await botSend(adminChatId, `🤖 Bot reactivado con: ${nombres.join(", ")}`);
    return;
  }

  // Cualquier otro texto en el chat de avisos se ignora (es una nota tuya).
}

// Borra las carpetas de sesión, con reintentos (Windows tarda en soltar archivos).
async function borrarSesion() {
  for (const dir of SESSION_DIRS) {
    for (let intento = 1; intento <= 10; intento++) {
      try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        break; // borrada (o no existía)
      } catch (err) {
        if (intento === 10) {
          console.error(`No se pudo borrar ${dir}: ${err.message}`);
        } else {
          await new Promise((r) => setTimeout(r, 500)); // esperar y reintentar
        }
      }
    }
  }
}

// Se llama cuando se cierra sesión: cierra el navegador, limpia y termina.
async function manejarLogout(motivo) {
  if (limpiandoSesion) return;
  limpiandoSesion = true;
  console.log(`🧹 Sesión cerrada (${motivo}). Limpiando carpetas...`);
  try {
    await client.destroy(); // cierra el navegador para liberar los archivos
  } catch {}
  await borrarSesion();
  console.log("✅ Carpetas de sesión borradas.");
  console.log("👉 Vuelve a iniciar con: npm start  (saldrá un QR nuevo para vincular).");
  process.exit(0);
}

// Red de seguridad: si la librería revienta al borrar la sesión (error EBUSY),
// lo atrapamos y hacemos la limpieza nosotros en vez de crashear.
process.on("unhandledRejection", (err) => {
  const msg = String(err?.message || err);
  if (msg.includes("EBUSY") || msg.includes(".wwebjs")) {
    manejarLogout("limpieza tras error EBUSY");
  } else {
    console.error("Error no manejado:", err);
  }
});

// ---- Mostrar el código QR para vincular WhatsApp ----
client.on("qr", async (qr) => {
  console.log("\n📱 Escanea este código QR con WhatsApp:");
  console.log("   (WhatsApp > Dispositivos vinculados > Vincular dispositivo)");
  console.log(`   …o ábrelo en el panel: http://localhost:${config.panelPort}\n`);
  qrcode.generate(qr, { small: true });
  estadoBot = "qr";
  try {
    qrDataUrl = await QRCode.toDataURL(qr); // imagen para el panel web
  } catch {
    qrDataUrl = null;
  }
});

client.on("ready", async () => {
  console.log("\n✅ ¡Bot conectado y listo! Esperando mensajes...\n");
  estadoBot = "conectado";
  qrDataUrl = null;

  // Normalizar el chat de control con el identificador EXACTO de WhatsApp.
  const miId = client.info?.wid?._serialized; // ej: 573001234567@c.us
  miNumero = client.info?.wid?.user; // solo dígitos
  if (!config.adminNumber || config.adminNumber === miNumero) {
    // El admin es tu propio número (o no lo configuraste): usa tu chat contigo mismo.
    adminChatId = miId;
  }
  console.log(`🛎️  Chat de control (avisos/comandos): ${adminChatId}`);

  // Avisarte a tu chat personal que el bot quedó encendido.
  if (adminChatId) {
    const ias = config.llmChain.map((p) => p.name).join(" → ") || "ninguna";
    try {
      await botSend(
        adminChatId,
        `🟢 *Bot encendido y atendiendo.*\n` +
          `IA(s) en uso: ${ias}\n\n` +
          `Escribe /estado aquí para ver chats en pausa.`
      );
    } catch (err) {
      console.error("No se pudo enviar el aviso de inicio:", err.message);
    }
  }
});

client.on("auth_failure", (m) => console.error("❌ Falló la autenticación:", m));
client.on("disconnected", async (motivo) => {
  console.error("⚠️  Bot desconectado:", motivo);
  estadoBot = "desconectado";
  // Si cerraste sesión (desde el teléfono o WhatsApp), limpiar la sesión vieja.
  if (motivo === "LOGOUT" || motivo === "NAVIGATION") {
    await manejarLogout(motivo);
  }
});

// ---- El corazón del bot: procesa cada mensaje ----
client.on("message_create", async (msg) => {
  try {
    // El chat del cliente: si el mensaje es tuyo (fromMe) el chat es el destino;
    // si es entrante, el chat es el remitente.
    const chatId = msg.fromMe ? msg.to : msg.from;

    // Ignorar grupos, estados y difusiones.
    if (!chatId || chatId.includes("@g.us") || chatId.includes("broadcast")) {
      return;
    }

    const esChatAdmin = adminChatId && chatId === adminChatId;

    // ========== CASO 1: el mensaje lo escribiste TÚ (fromMe) ==========
    if (msg.fromMe) {
      // ¿Es un mensaje que envió el propio bot? Lo reconocemos por ID o por texto
      // (por la carrera, a veces el evento llega antes de guardar el ID).
      if (botSentIds.has(msg.id?._serialized)) return;
      const iPend = pendingBotTexts.findIndex((p) => p.text === msg.body);
      if (iPend !== -1) {
        pendingBotTexts.splice(iPend, 1);
        return; // es un mensaje del bot, no tuyo
      }

      const textoTuyo = (msg.body || "").trim();

      // Comando de control: CUALQUIER mensaje tuyo que empiece con "/".
      // Funciona sin importar el formato del chat (@lid o @c.us).
      // (Escríbelos en tu chat de avisos para que el cliente no los vea.)
      if (textoTuyo.startsWith("/")) {
        await manejarComandoAdmin(textoTuyo);
        return;
      }

      // Cualquier otro mensaje que TÚ ENVÍES a un chat = estás atendiendo en
      // persona. (Solo al enviar; abrir o leer el chat no hace nada.)
      if (!esChatAdmin) {
        markHuman(chatId);
        addHistory(chatId, "assistant", msg.body);
        console.log(`✋ Enviaste un mensaje en el chat ${chatId}. Bot en pausa ahí.`);
      }
      return;
    }

    // ========== CASO 2: mensaje ENTRANTE ==========
    // Si viene desde un número de control distinto al del bot, es un comando.
    if (esChatAdmin) {
      await manejarComandoAdmin(msg.body || "");
      return;
    }

    const texto = (msg.body || "").trim();
    if (!texto) return;

    addHistory(chatId, "user", texto);

    // Si estabas atendiendo pero ya pasó tiempo, el bot retoma solo.
    maybeAutoResume(chatId);

    const modo = getMode(chatId);
    if (modo !== "AUTO") {
      console.log(`🔇 Chat ${chatId} en modo ${modo}. El bot no responde.`);
      return;
    }

    // Generar respuesta con la IA (con respaldo entre proveedores).
    const respuesta = await think(getHistory(chatId));

    if (noSabe(respuesta)) {
      await botSend(chatId, config.escalationMessage);
      setMode(chatId, "PENDING");
      await avisarDueno(chatId, texto);
      console.log(`🔔 Duda escalada al dueño desde ${chatId}.`);
    } else {
      await botSend(chatId, respuesta);
      addHistory(chatId, "assistant", respuesta);
    }
  } catch (err) {
    console.error("Error procesando mensaje:", err);
  }
});

// ---- Panel web de control ----
// Le pasamos funciones para que pueda leer el estado y actuar sobre el bot.
startServer({
  getStatus: async () => ({
    estado: estadoBot,
    qr: qrDataUrl,
    numero: miNumero ? `+${miNumero}` : null,
    ias: config.llmChain.map((p) => p.name).join(" → ") || "ninguna",
  }),
  listarPausados: async () =>
    Promise.all(
      listPaused().map(async (p) => ({
        id: p.chatId,
        nombre: await nombreDe(p.chatId),
        modo: p.mode,
      }))
    ),
  resume: (id) => setMode(id, "AUTO"),
  resumeAll: () => listPaused().forEach((p) => setMode(p.chatId, "AUTO")),
  getFaq: () => getFaqText(),
  setFaq: (texto) => setFaqText(texto),
});

console.log("Iniciando bot de la pensión... (esto puede tardar unos segundos)");
client.initialize();
