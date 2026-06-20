// Configuración central del bot. Lee los valores del archivo .env
import dotenv from "dotenv";
dotenv.config();

// ¿Cuál proveedor usar primero? "openrouter", "gemini" o "groq".
const provider = (process.env.LLM_PROVIDER || "openrouter").toLowerCase();

// --- OpenRouter: admite VARIOS modelos separados por coma (se intentan en orden) ---
const openrouterModels = (
  process.env.OPENROUTER_MODEL ||
  "openai/gpt-oss-120b:free,qwen/qwen3-next-80b-a3b-instruct:free,meta-llama/llama-3.3-70b-instruct:free"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const openrouterEntries = process.env.OPENROUTER_API_KEY
  ? openrouterModels.map((model) => ({
      name: `openrouter:${model.split("/").pop().replace(":free", "")}`,
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: process.env.OPENROUTER_API_KEY,
      model,
      headers: {
        "HTTP-Referer": "https://localhost",
        "X-Title": "Bot Pension",
      },
    }))
  : [];

// --- Gemini (respaldo) ---
const geminiEntry = process.env.GEMINI_API_KEY
  ? {
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    }
  : null;

// --- Groq (respaldo) ---
const groqEntry = process.env.GROQ_API_KEY
  ? {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    }
  : null;

// Grupos de IAs por proveedor (solo los que tengan llave configurada).
const groups = {
  openrouter: openrouterEntries,
  gemini: geminiEntry ? [geminiEntry] : [],
  groq: groqEntry ? [groqEntry] : [],
};

// Orden de intento: primero el proveedor elegido, luego los demás como respaldo.
const order = [provider, ...Object.keys(groups).filter((p) => p !== provider)];
const llmChain = order.flatMap((name) => groups[name] || []);

export const config = {
  provider,
  // Lista de IAs a intentar en orden (1ra = principal, las demás = respaldo)
  llmChain,

  // Número del dueño para recibir avisos (formato: 573001234567)
  adminNumber: (process.env.ADMIN_NUMBER || "").replace(/\D/g, ""),

  // Tiempo que el bot espera antes de retomar un chat donde entró el humano
  autoResumeMs: (Number(process.env.AUTO_RESUME_MINUTES) || 30) * 60 * 1000,

  // Cuántos mensajes recientes recuerda el bot por conversación (para dar contexto)
  historyLimit: 12,

  // Mensaje que envía el bot cuando NO sabe responder
  escalationMessage:
    "Esa duda la responde directamente la persona encargada 🙏 En un momento te respondo. ¡Gracias por tu paciencia!",
};

// Etiqueta interna que la IA devuelve cuando no sabe la respuesta.
export const NO_SE_TAG = "[NO_SE]";
