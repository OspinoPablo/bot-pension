// Servidor web del PANEL de control.
// Sirve la página (public/index.html) y una API que el panel consume para:
//  - ver el QR y el estado del bot
//  - listar chats en manual y reactivarlos
//  - editar el FAQ
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// Protección opcional con contraseña (Basic Auth). Si PANEL_PASSWORD está vacío,
// el panel queda abierto (úsalo solo en local; en un servidor pon contraseña).
function auth(req, res, next) {
  if (!config.panelPassword) return next();
  const header = req.headers.authorization || "";
  const [tipo, valor] = header.split(" ");
  if (tipo === "Basic" && valor) {
    const [, pass] = Buffer.from(valor, "base64").toString().split(":");
    if (pass === config.panelPassword) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Panel del bot"');
  res.status(401).send("Necesitas contraseña para entrar al panel.");
}

// ctx = funciones que conectan con el bot (las provee index.js):
//   getStatus()       -> { estado, qr, ias, numero }
//   listarPausados()  -> [{ id, nombre, modo }]
//   resume(id)        -> reactiva un chat
//   resumeAll()       -> reactiva todos
//   getFaq()          -> texto del FAQ
//   setFaq(texto)     -> guarda el FAQ
export function startServer(ctx) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(auth);
  app.use(express.static(PUBLIC_DIR));

  // Estado del bot + QR (si no está conectado).
  app.get("/api/status", async (_req, res) => {
    res.json(await ctx.getStatus());
  });

  // Lista de chats en pausa (manual o esperando).
  app.get("/api/paused", async (_req, res) => {
    res.json(await ctx.listarPausados());
  });

  // Reactivar el bot en un chat.
  app.post("/api/resume", async (req, res) => {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ ok: false, error: "falta id" });
    await ctx.resume(id);
    res.json({ ok: true });
  });

  // Reactivar el bot en todos los chats.
  app.post("/api/resume-all", async (_req, res) => {
    await ctx.resumeAll();
    res.json({ ok: true });
  });

  // Leer el FAQ.
  app.get("/api/faq", (_req, res) => {
    res.json({ texto: ctx.getFaq() });
  });

  // Guardar el FAQ.
  app.post("/api/faq", (req, res) => {
    const { texto } = req.body || {};
    if (typeof texto !== "string") {
      return res.status(400).json({ ok: false, error: "falta texto" });
    }
    ctx.setFaq(texto);
    res.json({ ok: true });
  });

  app.listen(config.panelPort, () => {
    console.log(`🖥️  Panel disponible en: http://localhost:${config.panelPort}`);
  });
}
