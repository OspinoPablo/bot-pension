# 🤖 Bot de WhatsApp para la pensión

Bot que responde dudas de estudiantes y trabajadores interesados en arrendar.
Usa IA para entender las preguntas (no es un menú rígido) y, si no sabe algo,
te avisa y te cede la conversación.

---

## ✨ Qué hace

- **Responde con naturalidad** usando la información que tú escribes en `data/faq.md`.
- **No inventa**: si la respuesta no está en tu FAQ, dice *"en un momento te respondo"*
  y te avisa a tu WhatsApp personal.
- **Traspaso automático**: cuando TÚ entras a responder desde tu celular, el bot
  detecta que entraste y **se calla solo en ese chat**. Vuelve a responder cuando:
  - escribes `/bot` en ese chat, o
  - pasan 30 minutos sin que escribas (configurable).

---

## 🛠️ Instalación (una sola vez)

### 1. Instalar Node.js
Descárgalo de https://nodejs.org (versión LTS, 18 o superior). Instálalo con
"siguiente, siguiente".

### 2. Instalar las dependencias del proyecto
Abre una terminal en esta carpeta y ejecuta:
```
npm install
```
> La primera vez descarga un navegador interno (Chromium) que WhatsApp necesita.
> Puede tardar varios minutos. Es normal.

### 3. Sacar tu llave de IA gratis (OpenRouter)
1. Entra a https://openrouter.ai/keys (crea cuenta, es gratis).
2. Crea una API key y cópiala.

### 4. Configurar el bot
1. Copia el archivo `.env.example` y renómbralo a `.env`.
2. Ábrelo y llena:
   - `OPENROUTER_API_KEY` → la llave que copiaste.
   - `ADMIN_NUMBER` → tu número personal para los avisos (ej: `573001234567`).
   - `LLM_PROVIDER` déjalo en `openrouter`. (Si llenas también `GEMINI_API_KEY`
     o `GROQ_API_KEY`, el bot las usa de respaldo si OpenRouter falla.)

### 5. Llenar la información de la pensión
Copia `data/faq.example.md` a `data/faq.md` (en la misma carpeta) y reemplaza
todos los `(escribe aquí)` con tus datos reales (precios, qué incluye, reglas,
etc.). El bot lee `faq.md`. Entre mejor lo llenes, mejor responde.

---

## ▶️ Cómo usarlo

En la terminal, en esta carpeta:
```
npm start
```

La primera vez aparecerá un **código QR** en la terminal. Escanéalo con tu WhatsApp:
**WhatsApp > Dispositivos vinculados > Vincular dispositivo**.

¡Listo! El bot ya responde. Deja esa ventana abierta (mientras esté abierta, el bot
funciona). No tienes que volver a escanear el QR la próxima vez.

---

## 🖥️ Panel web de control

Al arrancar el bot también se abre un panel en tu navegador:

**http://localhost:3000**

Desde ahí puedes, sin tocar la terminal:
- **Vincular WhatsApp** escaneando el QR (aparece en el panel cuando no está conectado).
- Ver el **estado** del bot y qué IAs están activas.
- Ver los **chats en pausa** (los que atiendes tú) y **reactivar el bot** con un botón.
- Editar el **FAQ** (la información de la pensión) y guardar; aplica al instante.

Configuración en el `.env`:
- `PANEL_PORT` → el puerto (por defecto 3000).
- `PANEL_PASSWORD` → déjalo vacío en tu PC. **En un servidor (VPC), ponle una
  contraseña** para que nadie más entre al panel.

---

## 🎮 Comandos (los escribes en TU chat de avisos, NO en el del cliente)

Tu "chat de avisos" es el chat contigo mismo donde el bot te notifica las dudas.
Los comandos se escriben **ahí**, así el cliente nunca los ve.

| Comando        | Qué hace                                                       |
|----------------|----------------------------------------------------------------|
| `/estado`      | Muestra la lista de chats en pausa (numerados).                |
| `/bot`         | Reactiva el bot en el último chat que atendiste.               |
| `/bot 2`       | Reactiva el bot en el chat número 2 de la lista de `/estado`.  |
| `/bot all`     | Reactiva el bot en todos los chats en pausa.                   |

> Nunca escribas comandos en el chat del cliente: ahí lo único que haces es
> responderle normal (eso pausa el bot en ese chat automáticamente).

---

## 🔄 Cómo funciona el traspaso (lo importante)

1. Llega una duda que el bot no sabe → te manda un aviso a tu chat personal con el
   nombre del cliente y la pregunta. El bot queda **callado** en ese chat.
2. Abres el chat del cliente y le respondes normal desde tu celular → el bot sigue
   **callado** ahí (sabe que estás tú). El cliente solo ve tus respuestas reales.
3. Cuando terminas, vuelves a **tu chat de avisos** y escribes `/bot` → el bot
   vuelve a atender ese chat. El cliente no ve ningún comando.
   (O no haces nada: tras 30 min sin que escribas, el bot retoma solo.)

---

## ❓ Problemas comunes

- **No llegan avisos**: revisa que `ADMIN_NUMBER` en `.env` tenga el formato correcto
  (código de país + número, sin `+` ni espacios).
- **El bot no responde nada**: revisa que `GROQ_API_KEY` esté bien puesta en `.env`.
- **Pide QR otra vez**: si borras la carpeta `.wwebjs_auth/` se cierra la sesión.

---

## ☁️ Pasar a una VPC gratis (más adelante)

Para que el bot funcione 24/7 sin tener tu PC encendida, puedes moverlo a
**Oracle Cloud Always Free** (una máquina gratis de por vida). Cuando llegues a
ese punto, avísame y te guío paso a paso.
