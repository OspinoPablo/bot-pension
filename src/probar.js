// Mini-chat de prueba en la TERMINAL para probar el "cerebro" del bot
// sin necesidad de WhatsApp ni de un segundo número.
//
// Úsalo con:  npm run probar
//
// Escribe preguntas como si fueras un cliente. Verás cómo responde la IA
// con tu FAQ. Si responde "[el bot avisaría al dueño...]" significa que
// esa pregunta no está cubierta y en WhatsApp escalaría a ti.
import readline from "readline";
import { think, noSabe } from "./brain.js";
import { config } from "./config.js";

const history = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("\n💬 Modo prueba del cerebro del bot.");
console.log("   Escribe preguntas como si fueras un cliente.");
console.log("   Escribe 'salir' para terminar.\n");

if (config.llmChain.length === 0) {
  console.log("⚠️  No hay ninguna llave de IA configurada en .env — la IA no podrá responder.\n");
} else {
  const nombres = config.llmChain.map((p) => p.name).join(" → ");
  console.log(`   IA(s) en uso: ${nombres}\n`);
}

function preguntar() {
  rl.question("Cliente> ", async (texto) => {
    const t = texto.trim();
    if (!t) return preguntar();
    if (t.toLowerCase() === "salir") {
      rl.close();
      return;
    }

    history.push({ role: "user", content: t });
    const respuesta = await think(history);

    if (noSabe(respuesta)) {
      console.log(
        "\nBot> " +
          config.escalationMessage +
          "\n      (↑ aquí el bot te avisaría a ti porque no supo responder)\n"
      );
    } else {
      history.push({ role: "assistant", content: respuesta });
      console.log("\nBot> " + respuesta + "\n");
    }
    preguntar();
  });
}

preguntar();
