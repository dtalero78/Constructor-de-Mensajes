// index.js

require('dotenv').config();

const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { jsonSchemaOutputFormat } = require('@anthropic-ai/sdk/helpers/json-schema');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const detect = require('detect-port').default;
const { exec } = require("child_process");
const path = require("path");
const { guardarMensaje, ultimoMensaje, obtenerMensaje, todosLosMensajes } = require('./database');

const app = express();
const upload = multer({ dest: 'uploads/' });
const DEFAULT_PORT = 3000;

app.use(cors());
app.use(cookieParser());

// El home rediseñado es la portada; el constructor sigue viviendo en /index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'home.html')));

app.use(express.static('public'));
app.use(express.json());

// Autenticación: registra /auth/* y expone los middlewares de sesión.
const { registrarRutas: registrarAuth, requiereSesion } = require('./auth');
registrarAuth(app);

console.log("🔍 Clave de Anthropic:", process.env.ANTHROPIC_API_KEY ? "✅ Sí" : "❌ No (el texto no va a funcionar)");
console.log("🔍 Clave de OpenAI:", process.env.OPENAI_API_KEY ? "✅ Sí" : "⚠️  No (audio desactivado: Whisper y TTS)");

// Todo el texto pasa por Claude.
const anthropic = new Anthropic();   // lee ANTHROPIC_API_KEY del entorno
const MODELO = "claude-opus-5";

/**
 * Un prompt de sistema + un turno de usuario → el texto de la respuesta.
 * Los prompts de esta app son autocontenidos y venían como un único mensaje
 * "system"; Claude exige al menos un turno de usuario, así que la instrucción
 * corta de la tarea va como turno del usuario.
 */
async function generarTexto(promptSistema, instruccionUsuario, opciones = {}) {
  const peticion = {
    model: MODELO,
    max_tokens: opciones.maxTokens || 16000,
    system: promptSistema,
    messages: [{ role: "user", content: instruccionUsuario }]
  };
  if (opciones.effort) peticion.output_config = { effort: opciones.effort };

  const respuesta = await anthropic.messages.create(peticion);

  if (respuesta.stop_reason === "refusal") {
    throw new Error("Claude declinó la petición" +
      (respuesta.stop_details?.explanation ? ": " + respuesta.stop_details.explanation : "."));
  }

  return respuesta.content
    .filter(bloque => bloque.type === "text")
    .map(bloque => bloque.text)
    .join("")
    .trim();
}

// OpenAI queda SOLO para audio: Anthropic no tiene transcripción ni TTS.
// Se construye perezosamente para que la app arranque sin OPENAI_API_KEY.
let openaiCliente = null;
function obtenerOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiCliente) openaiCliente = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiCliente;
}
/** Convierte un error del SDK en una frase que sirva en pantalla. */
function mensajeDeError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return "La clave de Anthropic no es válida (revisa ANTHROPIC_API_KEY en .env).";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Claude está limitando las peticiones. Intenta de nuevo en un momento.";
  }
  if (error instanceof Anthropic.BadRequestError && /usage limits/i.test(error.message || "")) {
    return "La cuenta de Anthropic alcanzó su tope de gasto. Súbelo en la consola de Anthropic.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Claude respondió ${error.status}: ${error.message}`;
  }
  return error?.message || "Error inesperado al hablar con Claude.";
}

const SIN_AUDIO = { error: "El audio necesita una clave de OpenAI (OPENAI_API_KEY): Whisper y TTS no existen en Anthropic." };

// Estilo de la comunidad, derivado de medir 10 prédicas reales (82.854 palabras).
// Las proporciones NO son decorativas: son conteos sobre ese corpus. Si se tocan,
// convendría volver a medirlas, porque el modelo las sigue bastante literalmente.
const tonoLivingRoom = `
🎙️ ESTILO LIVING ROOM — cómo suena de verdad un mensaje de esta comunidad.
Estas reglas salen de medir prédicas reales. No son matices de tono: son la forma.

VOZ
- Le hablas a UNA persona, no a un auditorio: segunda persona del singular ("tú").
- El plural existe y DEBE aparecer, pero solo para incluirte en la falla
  ("todos nos equivocamos aquí", "nosotros abortamos el plan"). La promesa y la
  instrucción siempre van en singular. Nunca "todos debemos": "tú necesitas".
  En cada sección tiene que haber al menos una frase donde te incluyas con "nosotros"
  al describir el error. Si una sección no tiene ninguna, está mal calibrada.
- Quien habla ya se estrelló con esto. La autoridad viene de haberlo vivido peor,
  no de saber más. Cuenta la derrota mientras sigue abierta, no desde la lección aprendida.

RITMO
- Ritmo hablado y VARIADO. La frase corta es el golpe, no el material de construcción:
  si escribes tres frases muy cortas seguidas, la siguiente tiene que ser larga.
  Un texto entero en frases de cinco palabras suena a telegrama, no a alguien hablando.
- La pregunta es la puntuación de este estilo, y tiene que abundar: casi todo párrafo
  largo lleva una. Muchas no esperan respuesta y solo marcan dónde está el peso
  ("¿te das cuenta?", "¿sabes qué?", "¿estamos claros?"). Lo único que no debe pasar
  es que un párrafo entero sea una ristra de preguntas encadenadas.
- Un marcador de escucha ("escúchame", "óyeme bien", "¿te das cuenta?") antes de las
  afirmaciones centrales, no antes de cada idea. Si aparece en cada párrafo, pierde
  todo el efecto y suena a tic.
- Esto se dice en voz alta. Si suena a texto escrito para leerse, reescríbelo.

MATERIAL
- Ninguna idea abstracta viaja sola: cada una entra por una escena física con
  objeto, lugar y cifra.
- Los ejemplos son domésticos y locales: el aeropuerto, el restaurante, la cancha,
  el banco, la obra, la cuota del colegio, el trancón.
- Se habla de plata, deuda y negocio sin eufemismo y sin pedir disculpas.
  Es el terreno donde aterriza todo lo demás.
- Todo concepto se vuelve objeto manipulable en la misma frase en que aparece
  (la palabra es una semilla; la lengua es el timón de un buque).

APLICACIÓN
- El abanico de aplicaciones es una ráfaga de vidas concretas seguidas, sin transición
  entre ellas. Va UNA sola vez en todo el mensaje, en la PROBLEMÁTICA.
- "Quizás" encadena esa ráfaga y solo esa. En el resto del mensaje evita la palabra:
  si la lees más de dos o tres veces fuera de la ráfaga, sobra y suena a muletilla.
- Reencuadra por negación antes de afirmar: "no es X, es Y".
- Anticipa la objeción del oyente poniéndola en su voz, y contéstala.

PROHIBIDO
- Moraleja moral o consejo de conducta. Si el texto se resume en "pórtate mejor",
  está mal escrito y hay que rehacerlo.
- Miedo, culpa o condena como palanca. El oyente debe sentirse descrito, nunca acusado.
- Cadenas de citas de autores, estadísticas, y jerga teológica sin traducir.
`;

let transcripciones = {
  titulo: "",
  introduccion: "",
  costura: "",
  problematica: "",
  conector: "",
  desarrollo: "",
  conclusion: "",
  ministracion: ""
};

const promptsFile = path.join(__dirname, 'prompts.json');
let promptsCalibracion = {};

// Las secciones se manejan en minúsculas en el frontend y en las columnas de SQLite,
// pero las claves de calibración son canónicamente MAYÚSCULAS (igual que relacionesImportantes).
// Todo acceso a promptsCalibracion pasa por aquí para que la caja nunca importe.
function normalizarSeccion(seccion) {
  return String(seccion || "").trim().toUpperCase();
}

function normalizarClavesPrompts(obj) {
  return Object.fromEntries(
    Object.entries(obj || {}).map(([clave, valor]) => [normalizarSeccion(clave), valor])
  );
}

function obtenerPromptCalibracion(seccion) {
  return promptsCalibracion[normalizarSeccion(seccion)] || "";
}

function savePrompts() {
  const dataToSave = { promptsCalibracion };
  fs.writeFileSync(promptsFile, JSON.stringify(dataToSave, null, 2), "utf8");
  console.log("✅ Prompts de calibración guardados en prompts.json");
}

function loadPrompts() {
  try {
    const data = fs.readFileSync(promptsFile, "utf8");
    const jsonData = JSON.parse(data);
    if (!jsonData.promptsCalibracion) {
      throw new Error("La propiedad 'promptsCalibracion' no existe en el archivo.");
    }
    promptsCalibracion = normalizarClavesPrompts(jsonData.promptsCalibracion);
    console.log("✅ Prompts de calibración cargados desde prompts.json");
  } catch (error) {
    console.error("❌ Error al leer prompts.json:", error);
    process.exit(1);
  }
}
loadPrompts();

// Función para reintentar la transcripción en caso de error
async function transcribeAudioWithRetries(audioFile, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const openai = obtenerOpenAI();
      if (!openai) throw new Error(SIN_AUDIO.error);
      const response = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
      });
      return response;
    } catch (error) {
      console.error(`❌ Intento ${attempt} de transcribir falló:`, error);
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Función para evaluar la transcripción de una sección
async function evaluarTranscripcion(transcripcion, section, usuario) {
  const promptBase = obtenerPromptCalibracion(section);

  let mensajeDesdeDB;
  try {
    mensajeDesdeDB = await obtenerMensajeDesdeBase(usuario);
    if (!mensajeDesdeDB) {
      console.warn("⚠️ No se encontró ningún mensaje en la base de datos para el usuario:", usuario);
      return "No se encontró contexto previo. Evalúa la sección de forma aislada.";
    }
  } catch (error) {
    console.error("❌ Error al obtener mensaje del usuario:", error);
    return "Error al acceder al contexto del usuario.";
  }

  // Construir contexto desde base de datos
  let contexto = "";
  for (const [clave, valor] of Object.entries(mensajeDesdeDB)) {
    if (normalizarSeccion(clave) !== normalizarSeccion(section) && clave !== "usuario" && clave !== "briefing" && valor?.trim?.()) {
      contexto += `🔹 ${clave.toUpperCase()}:\n${valor.trim()}\n\n`;
    }
  }

  console.log("📋 Mensaje desde la base de datos:", mensajeDesdeDB);
  console.log("📋 Contexto generado:", contexto);

  console.log("🧠 SECCIÓN A EVALUAR:", section.toUpperCase());
  console.log("👤 USUARIO:", usuario);
  console.log("🧩 CONTEXTO UTILIZADO:\n" + contexto || "(Sin contexto previo)");
  console.log("📝 TRANSCRIPCIÓN ACTUAL:\n" + transcripcion);





  const promptFinal = `
  Eres un editor de mensajes. Evalúa si la sección "${section.toUpperCase()}" se conecta correctamente con las partes anteriores del mensaje.
  
  🧭 Prompt de calibración para esta sección:
  "${promptBase}"
  
  A continuación te presento las secciones anteriores (si están disponibles):
  
  ${contexto || "❌ No hay otras secciones previas disponibles."}
  
  🔍 Sección actual a evaluar ("${section.toUpperCase()}"):
  ${transcripcion}
  
  🔧 Tu tarea:
  
  1. Evalúa si esta sección se conecta con las anteriores de forma lógica y coherente.
  2. Si necesita mejoras, sugiere una versión revisada.
  3. Finaliza tu respuesta con un resumen de **3 puntos clave** que expliquen tu evaluación, usando el contexto anterior como referencia.
  4. Evalúa la sección contra el ESTILO LIVING ROOM que aparece abajo, y sé concreto:
     señala qué frase suena escrita en vez de hablada, dónde falta un ejemplo físico,
     dónde se usó el plural para exhortar, y si el cierre cae en moraleja.
  
  ${tonoLivingRoom}
  `;


  console.log("📤 PROMPT COMPLETO ENVIADO A CLAUDE:\n" + promptFinal);


  try {
    return await generarTexto(promptFinal, "Evalúa la sección siguiendo las instrucciones y entrega tu respuesta.");
  } catch (error) {
    console.error("❌ Error en la evaluación:", error);
    return "Error en la evaluación de la transcripción.";
  }
}



// Función para evaluar la coherencia general del mensaje
async function evaluarHiloPredica() {
  const transcripcionCompleta = `
  📌 **Título:** ${transcripciones.titulo}
  📌 **Introducción:** ${transcripciones.introduccion}
  📌 **Costura:** ${transcripciones.costura}
  📌 **Problemática:** ${transcripciones.problematica}
  📌 **Conector:** ${transcripciones.conector}
  📌 **Desarrollo:** ${transcripciones.desarrollo}
  📌 **Conclusión:** ${transcripciones.conclusion}
  📌 **Ministración:** ${transcripciones.ministracion}
  `;
  const prompt = `
  Eres un experto en análisis de discursos. Evalúa la coherencia de esta prédica:

  1. ¿Las secciones se conectan lógicamente?
  2. ¿El mensaje central es claro y progresivo?
  3. ¿Se refuerza la enseñanza en la conclusión?
  4. ¿Hay equilibrio entre profundidad, aplicación práctica y claridad?

  Transcripción completa:
  "${transcripcionCompleta}"

  Proporciona una evaluación general con recomendaciones de mejora.
  `;
  try {
    return await generarTexto(prompt, "Evalúa el hilo completo de la prédica.");
  } catch (error) {
    console.error("❌ Error en la evaluación de la prédica completa:", error);
    return "Error en la evaluación de la prédica completa.";
  }
}

// Ruta para recibir audio, transcribirlo y evaluarlo
app.post("/transcribir", upload.single("audio"), async (req, res) => {
  if (!req.file || !req.body.section) {
    return res.status(400).json({ error: "No se recibió archivo de audio o sección." });
  }
  const section = req.body.section;
  console.log(`📂 Archivo recibido para ${section}:`, req.file.originalname);
  const inputPath = req.file.path;
  const outputPath = path.join(__dirname, "uploads", req.file.filename + ".wav");

  // Convertir el audio con ffmpeg
  exec(`ffmpeg -i ${inputPath} -ar 16000 -ac 1 -b:a 16k ${outputPath}`, async (error, stdout, stderr) => {
    if (error) {
      console.error("❌ Error durante la conversión con ffmpeg:", error);
      return res.status(500).json({ error: "Error en la conversión del archivo." });
    }
    try {
      if (!fs.existsSync(outputPath)) {
        throw new Error("El archivo convertido no existe.");
      }
      const stats = fs.statSync(outputPath);
      console.log("📏 Archivo WAV generado, tamaño:", stats.size, "bytes");
      if (stats.size < 1000) {
        throw new Error("El archivo convertido es demasiado pequeño, es posible que la conversión fallara.");
      }
    } catch (err) {
      console.error("❌ Error al verificar el archivo convertido:", err);
      return res.status(500).json({ error: "El archivo convertido no es válido." });
    }
    try {
      const audioFile = fs.createReadStream(outputPath);
      const response = await transcribeAudioWithRetries(audioFile, 3);
      const transcripcion = response.text;
      if (!transcripcion) {
        return res.status(500).json({ error: "Error en la transcripción: no se obtuvo texto." });
      }
      transcripciones[section] = transcripcion;
      const evaluacion = await evaluarTranscripcion(transcripcion, section);
      console.log(`🏆 Evaluación para ${section}:`, evaluacion);
      if (Object.values(transcripciones).every(t => t.trim() !== "")) {
        const evaluacionHilo = await evaluarHiloPredica();
        console.log("📢 Evaluación general de la prédica:", evaluacionHilo);
        res.json({ transcripcion, evaluacion, evaluacionHilo });
      } else {
        res.json({ transcripcion, evaluacion });
      }
    } catch (error) {
      console.error("❌ Error en la transcripción:", error);
      res.status(500).json({ error: "Error en la transcripción del audio." });
    } finally {
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (err) {
        console.error("❌ Error al eliminar archivos temporales:", err);
      }
    }
  });
});

let preguntasIniciales = {
  tema: "",
  proposito: "",
  audiencia: "",
  tiempo: ""
};

const preguntasFilePath = path.join(__dirname, "preguntas.json");

// Ruta para guardar las preguntas iniciales
app.post("/guardar-preguntas", (req, res) => {
  const { tema, proposito, audiencia, tiempo } = req.body;
  if (!tema || !proposito || !audiencia || !tiempo) {
    return res.status(400).json({ error: "Faltan respuestas." });
  }
  preguntasIniciales = { tema, proposito, audiencia, tiempo };
  console.log("📌 Preguntas iniciales guardadas:", preguntasIniciales);
  res.json({ success: true });
});

// Ruta para ver las preguntas (se devuelve un objeto vacío según la lógica actual)
app.get("/ver-preguntas", (req, res) => {
  try {
    res.json({ tema: "", proposito: "", audiencia: "", tiempo: "" });
  } catch (error) {
    console.error("❌ Error al leer preguntas guardadas:", error);
    res.status(500).json({ error: "Error al obtener las preguntas guardadas." });
  }
});

// Ruta para limpiar las preguntas
app.post("/limpiar-preguntas", (req, res) => {
  preguntasIniciales = { tema: "", proposito: "", audiencia: "", tiempo: "" };
  try {
    fs.writeFileSync(preguntasFilePath, JSON.stringify(preguntasIniciales, null, 2), 'utf8');
    console.log("✅ Preguntas limpiadas correctamente.");
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error al limpiar preguntas:", error);
    res.status(500).json({ error: "Error al limpiar preguntas." });
  }
});

// Ruta para evaluar el texto escrito de un bloc de notas
app.post('/evaluar-escrito', requiereSesion, async (req, res) => {
  const { section, texto } = req.body;
  const usuario = req.usuario.usuario;

  if (!texto || !usuario) {
    return res.status(400).json({ error: "El texto y el usuario son requeridos." });
  }

  console.log(`Evaluando sección "${section}" del usuario "${usuario}":`);
  console.log(texto);

  try {
    const evaluacion = await evaluarTranscripcion(texto, section, usuario);
    console.log("✅ Evaluación recibida:");
    console.log(evaluacion);
    res.json({ evaluacion });
  } catch (error) {
    console.error("❌ Error en /evaluar-escrito:", error);
    res.status(500).json({ error: "Error al evaluar el texto." });
  }
});


// Ruta para obtener la evaluación de una sección
app.get("/evaluacion", async (req, res) => {
  const section = req.query.seccion;
  if (!section) {
    return res.status(400).json({ error: "Sección no especificada." });
  }
  const transcripcion = transcripciones[section] || "Texto no disponible.";
  const evaluacion = await evaluarTranscripcion(transcripcion, section);
  res.json({ evaluacion });
});

// Ruta para aplicar sugerencias y generar una nueva versión del texto
app.post("/aplicar-sugerencias", requiereSesion, async (req, res) => {
  const { transcripcion, evaluacion, seccion } = req.body;
  const usuario = req.usuario.usuario;
  if (!transcripcion || !evaluacion || !seccion || !usuario) {
    return res
      .status(400)
      .json({ error: "Faltan la transcripción, la evaluación, la sección o el usuario." });
  }

  // Obtener el prompt inicial correspondiente a la sección
  const promptInicial = obtenerPromptCalibracion(seccion);

  // Obtener contexto desde base de datos (otras secciones del mensaje)
  let contexto = "";
  try {
    const mensajeDesdeDB = await obtenerMensajeDesdeBase(usuario);
    if (mensajeDesdeDB) {
      for (const [clave, valor] of Object.entries(mensajeDesdeDB)) {
        if (normalizarSeccion(clave) !== normalizarSeccion(seccion) && clave !== "usuario" && clave !== "briefing" && valor?.trim?.()) {
          contexto += `🔹 ${clave.toUpperCase()}:\n${valor.trim()}\n\n`;
        }
      }
    }
  } catch (error) {
    console.error("❌ Error al obtener contexto para aplicar sugerencias:", error);
  }

  // Construir el prompt final
  const promptFinal = `
  Eres un asistente de escritura experto.
  Considera el siguiente prompt inicial para la sección "${seccion}":
  "${promptInicial}"
  
  A continuación, tienes la transcripción original:
  "${transcripcion}"
  
  Y estas son las sugerencias para mejorarla:
  "${evaluacion}"
  
  Tu tarea es:
  
  1. Producir una nueva versión del texto que incorpore las sugerencias de manera coherente y clara.
  2. Respetar el estilo del autor y el contexto general.
  3. Finaliza con un resumen de **3 mejoras aplicadas**, explicando brevemente por qué se realizaron y cómo mejoran la sección respecto al mensaje global.
  4. Evalúa la sección contra el ESTILO LIVING ROOM que aparece abajo, y sé concreto:
     señala qué frase suena escrita en vez de hablada, dónde falta un ejemplo físico,
     dónde se usó el plural para exhortar, y si el cierre cae en moraleja.

  ${tonoLivingRoom}
  `;



  try {
    const sugerida = await generarTexto(promptFinal, "Reescribe la sección incorporando la evaluación.");
    res.json({ transcripcionSugerida: sugerida });
  } catch (error) {
    console.error("❌ Error al aplicar sugerencias:", error);
    res.status(500).json({ error: mensajeDeError(error) });
  }
});



// Ruta para guardar un mensaje completo (usuario, fecha, y secciones)
app.post('/guardar-mensaje', requiereSesion, async (req, res) => {
  try {
    // La identidad viene de la cookie: el cliente ya no elige de quién escribe.
    const { id } = await guardarMensaje({ ...req.body, usuario: req.usuario.usuario });
    return res.json({ success: true, id });
  } catch (error) {
    console.error("❌ Error al guardar el mensaje:", error.message);
    return res.status(500).json({ error: "Error al guardar el mensaje" });
  }
});


// Ruta para obtener todos los mensajes guardados
app.get('/obtener-mensajes', requiereSesion, async (req, res) => {
  try {
    // Siempre los del dueño de la sesión. Antes, sin ?usuario=, devolvía los de todos.
    res.json(await todosLosMensajes(req.usuario.usuario));
  } catch (error) {
    console.error("❌ Error al obtener mensajes:", error.message);
    res.status(500).json({ error: "Error al obtener mensajes" });
  }
});

// Ruta para obtener la última nota guardada de un usuario
app.get('/obtener-ultimo-mensaje', requiereSesion, async (req, res) => {
  try {
    const mensaje = await ultimoMensaje(req.usuario.usuario);
    if (!mensaje) {
      return res.json({ success: false, message: "No se encontraron notas para este usuario." });
    }
    return res.json({ success: true, mensaje });
  } catch (error) {
    console.error("❌ Error al obtener último mensaje:", error.message);
    return res.status(500).json({ error: "Error al obtener mensaje" });
  }
});


// Un mensaje concreto del usuario (el home enlaza a /index.html?mensaje=<id>)
app.get('/obtener-mensaje', requiereSesion, async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Falta 'id'" });
  try {
    const mensaje = await obtenerMensaje(id, req.usuario.usuario);
    if (!mensaje) return res.status(404).json({ success: false, error: "Mensaje no encontrado" });
    return res.json({ success: true, mensaje });
  } catch (error) {
    console.error("❌ Error al obtener el mensaje:", error.message);
    return res.status(500).json({ error: "Error al obtener el mensaje" });
  }
});


// Ruta para actualizar la calibración de prompts
app.post("/actualizar-calibracion", (req, res) => {
  const nuevosPrompts = req.body;
  if (typeof nuevosPrompts !== "object") {
    return res.status(400).json({ error: "Formato inválido." });
  }
  promptsCalibracion = { ...promptsCalibracion, ...normalizarClavesPrompts(nuevosPrompts) };
  savePrompts();
  console.log("✅ Prompts de calibración actualizados:", promptsCalibracion);
  res.json({ success: true, promptsCalibracion });
});

// Endpoint para convertir texto a audio (TTS)
app.post('/api/tts', async (req, res) => {
  try {
    const { model, input } = req.body;
    const openai = obtenerOpenAI();
    if (!openai) return res.status(503).json(SIN_AUDIO);
    // Se define la voz "ash" para que suene menos gringa
    const voice = "ash";
    // Llamada a la API de OpenAI para generar el audio
    const mp3 = await openai.audio.speech.create({
      model,   // "tts-1" o "tts-1-hd"
      voice,   // Voz configurada: "ash"
      input    // El texto a convertir
    });
    // Convertir la respuesta a un buffer
    const buffer = Buffer.from(await mp3.arrayBuffer());
    // Configurar el tipo de contenido y enviar el audio
    res.set('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (error) {
    console.error("Error en TTS:", error);
    res.status(500).json({ error: "Error al generar el audio." });
  }
});



// Ruta para obtener los prompts de calibración actuales
app.get("/obtener-calibracion", (req, res) => {
  res.json({ promptsCalibracion });
});


function obtenerMensajeDesdeBase(usuario) {
  return ultimoMensaje(usuario);
}



// Servir index.html SOLO para rutas que NO son archivos estáticos
app.get('*', (req, res, next) => {
  const isStaticAsset = req.path.includes('.') || req.path.startsWith('/api');
  if (isStaticAsset) return next();
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});


// Detectar puerto libre y lanzar servidor
detect(3000).then(freePort => {
  app.listen(freePort, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${freePort}`);
  });
}).catch(err => {
  console.error("❌ Error al detectar puerto libre:", err);
});

// ============================================================
// AGENTE ENTREVISTADOR — una pregunta a la vez, hasta tener briefing
// ============================================================

// Tope duro: red de seguridad contra una entrevista que nunca cierra
const MAX_PREGUNTAS = 12;

// El esquema obliga la forma de la respuesta: el front nunca parsea prosa.
const texto = { type: "string" };
const ESQUEMA_ENTREVISTA = {
  type: "object",
  properties: {
    estado: { type: "string", enum: ["preguntando", "listo"] },
    pregunta: texto,
    porQue: texto,
    briefing: {
      type: "object",
      properties: {
        ideaCentral: texto,
        audiencia: texto,
        transformacion: texto,
        historiaAncla: texto,
        tension: texto,
        tiempo: texto
      },
      required: ["ideaCentral", "audiencia", "transformacion", "historiaAncla", "tension", "tiempo"],
      additionalProperties: false
    }
  },
  required: ["estado", "pregunta", "porQue", "briefing"],
  additionalProperties: false
};

const promptEntrevistador = `
Eres el entrevistador de Living Room Speakers. Tu trabajo NO es escribir la prédica:
es sacarle al predicador el material crudo que hace falta para construirla.

Un mensaje Living Room se compone de 8 pilares: TÍTULO, INTRODUCCIÓN, COSTURA,
PROBLEMÁTICA, CONECTOR, DESARROLLO, CONCLUSIÓN y MINISTRACIÓN. Cada pregunta que
haces existe porque alimenta uno de ellos:

- Idea central y texto base → TÍTULO y COSTURA
- Audiencia concreta → INTRODUCCIÓN y PROBLEMÁTICA
- Transformación buscada (qué hace distinto el lunes) → CONCLUSIÓN y MINISTRACIÓN
- Historia propia del predicador → INTRODUCCIÓN
- Tensión u objeción real de esa audiencia → PROBLEMÁTICA y CONECTOR
- Tiempo disponible → extensión del DESARROLLO

REGLAS:
1. Haz UNA sola pregunta por turno. Corta, en segunda persona, sin preámbulos.
2. Si la respuesta es vaga, genérica o abstracta ("hablar de la fe", "para todos",
   "que crezcan espiritualmente"), REPREGUNTA pidiendo algo concreto: un nombre, una
   escena, una fecha, un ejemplo real. No te conformes.
3. Nunca preguntes algo que ya te respondieron. Construye sobre lo dicho.
4. No propongas contenido de la prédica ni redactes secciones. Solo preguntas.
5. Cierra cuando tengas material real en los seis campos del briefing. Nunca antes de
   5 preguntas; si llegas a ${MAX_PREGUNTAS}, cierra con lo que tengas.

TONO:
${tonoLivingRoom}

FORMATO: la respuesta se valida contra un esquema fijo, así que rellena todos los campos.
- Con estado "preguntando": escribe "pregunta" y "porQue" (media línea diciendo para qué
  sirve esa pregunta), y en "briefing" pon lo que ya sepas, con "" en lo que aún no.
- Con estado "listo": deja "pregunta" y "porQue" en "", y entrega el briefing completo,
  redactado en frases claras y en las palabras del predicador, no en las tuyas.
`;

app.post('/agente/entrevista', requiereSesion, async (req, res) => {
  const { conversacion = [], cerrar = false } = req.body;

  if (!Array.isArray(conversacion)) {
    return res.status(400).json({ error: "conversacion debe ser un arreglo" });
  }

  const preguntasHechas = conversacion.filter(t => t.rol === "agente").length;

  // El primer turno siempre es del usuario: la API lo exige y así la
  // alternancia queda pareja con las preguntas del agente.
  const messages = [{ role: "user", content: "Empecemos. Hazme la primera pregunta." }];
  for (const turno of conversacion) {
    messages.push({
      role: turno.rol === "agente" ? "assistant" : "user",
      content: String(turno.texto || "")
    });
  }

  if (conversacion.length && (cerrar || preguntasHechas >= MAX_PREGUNTAS)) {
    messages.push({
      role: "user",
      content: "Ya no quiero más preguntas. Cierra ahora con estado \"listo\" y arma el briefing con lo que tengas."
    });
  }

  // effort "low" no es por ahorrar: con el esfuerzo alto (el default) la API
  // rechaza esta combinación de salida estructurada + pensamiento adaptativo con
  // un 400 intermitente. Medido: low 8/8, medium 7/8, high 2/8. Además responde
  // en la mitad de tiempo, que para una pregunta corta es lo que se quiere.
  const peticion = {
    model: MODELO,
    max_tokens: 4000,
    system: promptEntrevistador,
    messages,
    output_config: { format: jsonSchemaOutputFormat(ESQUEMA_ENTREVISTA), effort: "low" }
  };

  try {
    let respuesta;
    try {
      respuesta = await anthropic.messages.parse(peticion);
    } catch (primerIntento) {
      // El SDK no reintenta los 400. Este en concreto es intermitente, así que
      // vale un segundo intento antes de darle un error al predicador.
      if (!(primerIntento instanceof Anthropic.BadRequestError)) throw primerIntento;
      console.warn("⚠️  400 en la entrevista; reintentando una vez.");
      respuesta = await anthropic.messages.parse(peticion);
    }

    if (respuesta.stop_reason === "refusal") {
      console.error("❌ El entrevistador declinó:", respuesta.stop_details);
      return res.status(502).json({ error: "El agente declinó responder." });
    }

    const data = respuesta.parsed_output;
    if (!data) {
      console.error("❌ El entrevistador no devolvió una respuesta con la forma esperada.");
      return res.status(502).json({ error: "El agente devolvió una respuesta ilegible." });
    }

    data.preguntasHechas = preguntasHechas;
    return res.json(data);
  } catch (error) {
    console.error("❌ Error en la entrevista:", error);
    return res.status(500).json({ error: mensajeDeError(error) });
  }
});


// ============================================================
// ENTREVISTA POR VOZ — OpenAI Realtime (Anthropic no tiene voz en tiempo real)
// El navegador NUNCA ve la OPENAI_API_KEY: el servidor emite un token efímero
// (~1 min) y de paso deja la sesión ya configurada, así las instrucciones de
// Living Room tampoco viajan al cliente en texto plano.
// ============================================================
const MODELO_VOZ = "gpt-realtime-2.1";
const VOZ_AGENTE = "marin";

const promptEntrevistadorVoz = `
Eres el entrevistador de Living Room Speakers y estás hablando POR VOZ con un predicador.
Tu trabajo NO es escribir la prédica: es sacarle el material crudo para construirla.

Necesitas llenar seis campos, y solo seis:
- ideaCentral: la idea del mensaje, en una frase.
- audiencia: a quién le habla, concreto (edad, ciudad, situación), no "a todos".
- transformacion: qué hace distinto esa persona el lunes.
- historiaAncla: una historia PROPIA del predicador, con escena, lugar y detalle.
- tension: la objeción real de esa audiencia, dicha con sus palabras.
- tiempo: cuántos minutos va a hablar.

CÓMO HABLAS
- Español latinoamericano, cercano y natural. Tuteas.
- UNA sola pregunta por turno. Corta. Sin preámbulos ni resúmenes largos.
- Esto es una conversación hablada: frases breves, nada de listas ni de viñetas.
- No repitas lo que acaba de decir salvo media frase para confirmar y seguir.
- Si la respuesta es vaga ("hablar de la fe", "para todos", "que crezcan"),
  REPREGUNTA pidiendo algo concreto: un nombre, una escena, una fecha, una cifra.
  No te conformes, pero sin ponerte pesado: máximo dos repreguntas por campo.
- La historia ancla es la que más cuesta sacar. Pide el detalle físico:
  dónde estaba, qué hora era, quién estaba, qué dijo exactamente.
- Nunca propongas contenido de la prédica ni redactes secciones. Solo preguntas.

CUÁNDO CIERRAS
Cuando tengas material real en los seis campos, di en una frase que ya tienes lo
necesario y llama a la función entregar_briefing. Nunca antes de cinco preguntas.
Si la persona te dice que ya no quiere más preguntas, cierra con lo que tengas.
Redacta el briefing con las palabras del predicador, no con las tuyas.
`;

const TOOL_BRIEFING_VOZ = {
  type: "function",
  name: "entregar_briefing",
  description: "Entrega el briefing terminado. Llámala solo cuando tengas material real en los seis campos, o cuando el predicador pida cerrar.",
  parameters: {
    type: "object",
    properties: {
      ideaCentral: { type: "string", description: "La idea central del mensaje, en una frase." },
      audiencia: { type: "string", description: "A quién le habla, concreto." },
      transformacion: { type: "string", description: "Qué hace distinto el oyente el lunes." },
      historiaAncla: { type: "string", description: "La historia propia del predicador, con su detalle." },
      tension: { type: "string", description: "La objeción real de esa audiencia." },
      tiempo: { type: "string", description: "Tiempo disponible del mensaje." }
    },
    required: ["ideaCentral", "audiencia", "transformacion", "historiaAncla", "tension", "tiempo"],
    additionalProperties: false
  }
};

app.post('/agente/voz/token', requiereSesion, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "La entrevista por voz necesita una clave de OpenAI (OPENAI_API_KEY)." });
  }
  try {
    const r = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: MODELO_VOZ,
          instructions: promptEntrevistadorVoz + "\n" + tonoLivingRoom,
          audio: {
            input: {
              transcription: { model: "gpt-4o-transcribe", language: "es" },
              turn_detection: { type: "semantic_vad" }
            },
            output: { voice: VOZ_AGENTE }
          },
          tools: [TOOL_BRIEFING_VOZ]
        }
      })
    });

    const texto = await r.text();
    if (!r.ok) {
      console.error("❌ OpenAI rechazó el token de voz:", r.status, texto.slice(0, 300));
      return res.status(502).json({ error: "No se pudo abrir la sesión de voz con OpenAI." });
    }

    const datos = JSON.parse(texto);
    const secreto = datos.value || datos.client_secret?.value;
    if (!secreto) {
      console.error("❌ El token de voz vino sin valor:", texto.slice(0, 300));
      return res.status(502).json({ error: "OpenAI devolvió una sesión de voz ilegible." });
    }
    // Solo sale el token efímero: ni la clave ni las instrucciones.
    return res.json({ token: secreto, modelo: MODELO_VOZ, expira: datos.expires_at || null });
  } catch (error) {
    console.error("❌ Error abriendo la sesión de voz:", error);
    return res.status(500).json({ error: "Error abriendo la sesión de voz." });
  }
});

app.post('/clasificar-idea', requiereSesion, async (req, res) => {
  const { idea } = req.body;
  const usuario = req.usuario.usuario;

  if (!idea || !usuario) {
    return res.status(400).json({ error: "La idea y el usuario son requeridos." });
  }

  try {
    // Obtener el contexto desde la base de datos
    let contexto = "";
    try {
      const mensajeDesdeDB = await obtenerMensajeDesdeBase(usuario);
      if (mensajeDesdeDB) {
        for (const [clave, valor] of Object.entries(mensajeDesdeDB)) {
          if (clave !== "usuario" && clave !== "briefing" && valor?.trim?.()) {
            contexto += `🔹 ${clave.toUpperCase()}:\n${valor.trim()}\n\n`;
          }
        }
      }
    } catch (error) {
      console.error("❌ Error al obtener contexto para clasificar idea:", error);
    }

    // Verificar si el contexto se generó correctamente
    if (!contexto) {
      console.warn("⚠️ No se encontró contexto previo para el usuario:", usuario);
      contexto = "❌ No hay contexto previo disponible.";
    }

    // Construir el prompt para clasificar la idea
    const prompt = `
  Eres un asistente que ayuda a estructurar mensajes basados en 8 pilares fundamentales:
  TÍTULO, INTRODUCCIÓN, COSTURA, PROBLEMÁTICA, CONECTOR, DESARROLLO, CONCLUSIÓN, MINISTRACIÓN.
  
  Cada pilar tiene instrucciones específicas:
  ${JSON.stringify(promptsCalibracion, null, 2)}

  El tono del mensaje debe ser:
  ${tonoLivingRoom}

  A continuación, tienes el contexto del mensaje del usuario (si está disponible):
  ${contexto}

  Clasifica la siguiente idea en uno de los pilares y explica por qué:
  "${idea}"

  Además, utiliza el contexto proporcionado para justificar tu clasificación. Explica cómo las secciones previas del mensaje influyen en la decisión de clasificar esta idea en el pilar seleccionado. Si no hay contexto disponible, clasifica la idea de forma aislada. Asegúrate de mencionar explícitamente las secciones relevantes del contexto que respaldan tu decisión.
`;

    // Llamada a OpenAI para clasificar la idea
    const clasificacion = await generarTexto(prompt, "Clasifica la idea en uno de los 8 pilares y justifica.");
    res.json({ clasificacion });
  } catch (error) {
    console.error("Error al clasificar la idea:", error);
    res.status(500).json({ error: mensajeDeError(error) });
  }
});



// ✅ PARA ALPHA `generar-una-sugerencia` sin calificación y con contexto visible


// ============================================================
// ANÁLISIS PROFUNDO DE LA CURVA
// La heurística de public/calibracion.js comprueba si el material de cada tramo
// está presente; eso es todo lo que se puede medir con conteos honestamente.
// Esto es la otra mitad: el juicio cualitativo sobre si el tramo FUNCIONA.
// ============================================================
const TRAMOS_CURVA = [
  { clave: "complicidad",   nombre: "Complicidad",       pilares: ["introduccion"],  busca: "que la apertura desarme y haga sonreír sin cobrarle nada a nadie todavía" },
  { clave: "reconocimiento", nombre: "Reconocimiento",   pilares: ["costura"],       busca: "que el oyente se vea retratado y piense «ese soy yo»" },
  { clave: "incomodidad",   nombre: "Incomodidad",       pilares: ["problematica"],  busca: "que nombre una conducta concreta y de verdad incomode, sin acusar ni dar culpa" },
  { clave: "tension",       nombre: "Tensión sostenida", pilares: ["desarrollo"],    busca: "que aguante sin resolver, sosteniendo la espera antes de dar la salida" },
  { clave: "alivio",        nombre: "Alivio",            pilares: ["conclusion"],    busca: "que traslade la carga del oyente a Dios y no cierre con moraleja ni con tarea" },
  { clave: "envio",         nombre: "Envío",             pilares: ["ministracion"],  busca: "que sea breve, con un acto físico y una frase que se diga en voz alta" }
];

const ESQUEMA_CURVA = {
  type: "object",
  properties: {
    tramos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clave: { type: "string", enum: TRAMOS_CURVA.map(t => t.clave) },
          nombre: { type: "string" },
          nivel: { type: "string", enum: ["alto", "medio", "bajo"] },
          comentario: { type: "string" }
        },
        required: ["clave", "nombre", "nivel", "comentario"],
        additionalProperties: false
      }
    }
  },
  required: ["tramos"],
  additionalProperties: false
};

app.post('/analizar-curva', requiereSesion, async (req, res) => {
  const secciones = req.body?.secciones || {};
  const escritas = TRAMOS_CURVA
    .flatMap(t => t.pilares)
    .filter(p => String(secciones[p] || "").trim());

  if (escritas.length < 2) {
    return res.status(400).json({ error: "Hacen falta al menos dos secciones escritas para analizar la curva." });
  }

  const cuerpo = TRAMOS_CURVA.map(t => {
    const texto = t.pilares.map(p => String(secciones[p] || "").trim()).filter(Boolean).join("\n\n");
    return `### ${t.nombre} — se alimenta de ${t.pilares.join(", ").toUpperCase()}\nQué debe lograr: ${t.busca}\n\n${texto || "(sin escribir todavía)"}`;
  }).join("\n\n---\n\n");

  const prompt = `
Eres el editor de mensajes de Living Room. Vas a evaluar la CURVA EMOCIONAL de un mensaje.

La curva de esta comunidad tiene seis tramos y una forma característica: abre en complicidad,
sube al reconocimiento, BAJA deliberadamente a la incomodidad, sostiene la tensión un buen rato
sin resolver, y solo entonces sube al alivio y cierra con el envío.

El descenso a la incomodidad es el tramo que casi todos se saltan, y es el que hace que el alivio
del final signifique algo: sin peso previo, no hay nada que quitar.

${tonoLivingRoom}

Estas son las secciones escritas hasta ahora:

${cuerpo}

Para CADA UNO de los seis tramos devuelve:
- "nivel": "alto" si el tramo cumple su función, "medio" si se queda a medias, "bajo" si falla
  o si aún no hay texto suficiente para lograrlo.
- "comentario": DOS frases como máximo. Sé concreto y cita el texto del predicador cuando puedas.
  Di qué falta o qué sobra, no des una nota general. Si el tramo está vacío, dilo en una frase.

No repitas lo que ya es evidente por la longitud. Juzga si FUNCIONA, no si está presente.
`;

  const peticion = {
    model: MODELO,
    max_tokens: 4000,
    system: prompt,
    messages: [{ role: "user", content: "Evalúa los seis tramos de la curva." }],
    // effort "low" por la misma razón que en /agente/entrevista: salida estructurada
    // con esfuerzo alto devuelve 400 intermitentes.
    output_config: { format: jsonSchemaOutputFormat(ESQUEMA_CURVA), effort: "low" }
  };

  try {
    let respuesta;
    try {
      respuesta = await anthropic.messages.parse(peticion);
    } catch (primerIntento) {
      if (!(primerIntento instanceof Anthropic.BadRequestError)) throw primerIntento;
      console.warn("⚠️  400 al analizar la curva; reintentando una vez.");
      respuesta = await anthropic.messages.parse(peticion);
    }
    const data = respuesta.parsed_output;
    if (!data) return res.status(502).json({ error: "El análisis devolvió una respuesta ilegible." });
    return res.json(data);
  } catch (error) {
    console.error("❌ Error analizando la curva:", error);
    return res.status(500).json({ error: mensajeDeError(error) });
  }
});

// TÍTULO y COSTURA se guardan tal cual como la sección, y son de una sola línea.
// El párrafo "🔗 Conexión con lo anterior" que se le pide al resto acabaría dentro
// del mensaje, así que a estas dos se les prohíbe explícitamente.
const SECCIONES_DE_UNA_LINEA = new Set(["TITULO", "COSTURA", "CONECTOR"]);

const relacionesImportantes = {
  // 1. TÍTULO (EPÍTOME)
  "TITULO": {
    dependsOn: [], // No depende de ninguna sección previa en el flujo lineal.
    weight: 1, // Peso de la sección en el esquema general
    purpose: "Una frase breve, atractiva y clara que dé una idea de lo que se va a tratar, creando expectativa y curiosidad."
  },

  // 2. INTRODUCCIÓN
  "INTRODUCCION": {
    dependsOn: [
      { source: "TITULO", type: "temática", weight: 3 } // La intro debe reflejar el título.
    ],
    weight: 2,
    purpose: "Captar la atención y establecer la relevancia del tema, generando tensión o interés."
  },

  // 3. COSTURA
  "COSTURA": {
    dependsOn: [
      { source: "INTRODUCCION", type: "tensión", weight: 4 }, // Conecta la tensión de la intro.
      { source: "PROBLEMATICA", type: "tensión", weight: 4 } // Conecta la tensión de la problemática.
    ],
    weight: 2,
    purpose: "Comunicar la tensión de la introducción con la tensión de la problemática a través de una frase o analogía."
  },

  // 4. PROBLEMÁTICA (TENSIÓN)
  "PROBLEMATICA": {
    dependsOn: [
      { source: "INTRODUCCION", type: "contexto_necesidad", weight: 3 }, // Se basa en la relevancia establecida en la intro.
      { source: "COSTURA", type: "transición_fluida", weight: 5 } // La costura lleva directamente a la problemática.
    ],
    weight: 3,
    purpose: "Presentar el conflicto central que la Palabra de Dios viene a iluminar o resolver."
  },

  // 5. CONECTOR
  "CONECTOR": {
    dependsOn: [
      { source: "PROBLEMATICA", type: "cierre_problema", weight: 5 } // Enlaza directamente la problemática.
    ],
    weight: 4,
    purpose: "Ser la transición que enlaza la problemática con la solución en el desarrollo, anunciando su importancia CON UNA SOLA FRASE"
  },

  // 6. DESARROLLO
  "DESARROLLO": {
    dependsOn: [
      { source: "PROBLEMATICA", type: "resolucion", weight: 5 }, // Resuelve la problemática planteada.
      { source: "CONECTOR", type: "continuacion_solucion", weight: 5 } // Continúa el anuncio del conector.
    ],
    weight: 5,
    purpose: "Ser la parte central de la prédica donde se presentan los puntos con respaldo bíblico y ejemplos claros, coherentes y profundos."
  },

  // 7. CONCLUSIÓN
  "CONCLUSION": {
    dependsOn: [
      { source: "DESARROLLO", type: "recapitulacion", weight: 5 }, // Recapitula los puntos del desarrollo.
      { source: "INTRODUCCION", type: "cierre_circular", weight: 2 }, // Puede volver a la intro (círculo perfecto).
      { source: "TITULO", type: "cierre_circular", weight: 1 } // Puede volver al título para cerrar.
    ],
    weight: 3,
    purpose: "Cerrar el mensaje retomando la idea principal, reforzando la enseñanza y motivando a la acción."
  },

  // 8. MINISTRACIÓN
  "MINISTRACION": {
    dependsOn: [
      { source: "CONCLUSION", type: "respuesta_final", weight: 4 }, // Es la respuesta a la conclusión y llamado.
      { source: "DESARROLLO", type: "respuesta_mensaje_central", weight: 3 } // Se basa en la enseñanza general del desarrollo.
    ],
    weight: 2,
    purpose: "Ser el momento de respuesta espiritual al mensaje, conectado con la enseñanza y el llamado."
  }
};

app.post('/generar-una-sugerencia', requiereSesion, async (req, res) => {
  const { seccion, respuestas, contextoPrevio = {}, briefing = null } = req.body;

  const seccionActual = seccion.toUpperCase();
  const promptBase = obtenerPromptCalibracion(seccionActual);

  const propositoSeccionActual = relacionesImportantes[seccionActual]?.purpose || "Generar contenido relevante para esta sección.";

  let contextoParaPrompt = "";
  const seccionesPreviasDisponibles = [];
  for (const [sec, texto] of Object.entries(contextoPrevio)) {
    const secMayus = sec.toUpperCase();
    if (secMayus !== seccionActual && texto?.trim?.()) {
      contextoParaPrompt += `\n🔹 Sección "${secMayus}":\n${texto.trim()}\n`;
      seccionesPreviasDisponibles.push(secMayus);
    }
  }
  if (!contextoParaPrompt) {
    contextoParaPrompt = "❌ No hay contenido de secciones previas disponible aún.";
  }

  const dependenciasConfig = relacionesImportantes[seccionActual]?.dependsOn || [];
  const conexionesRelevantesConPeso = dependenciasConfig
    .filter(dep => seccionesPreviasDisponibles.includes(dep.source))
    .map(dep => ({
      seccion: dep.source,
      peso: dep.weight,
      tipo: dep.type
    }));

  conexionesRelevantesConPeso.sort((a, b) => b.peso - a.peso);

  const seccionesRelevantesParaConectar = conexionesRelevantesConPeso.map(c => c.seccion);

  let indicacionesDeConexion = "";
  if (seccionesRelevantesParaConectar.length > 0) {
    const listaConDetalles = conexionesRelevantesConPeso
      .map(c => `"${c.seccion}" (conexión tipo: ${c.tipo}, peso: ${c.peso})`)
      .join(', ');

    indicacionesDeConexion = `\n💡 ENFOQUE DE CONEXIÓN:\nTu sugerencia debe conectarse de manera fluida y lógica con el contenido de las siguientes secciones previas, priorizando según su importancia: ${listaConDetalles}. Asegúrate de que tu propuesta construya sobre estas bases y refleje el **tipo de conexión** y el **peso** indicado para cada una.\n`;
  }

  // El agente entrevistador manda un briefing completo; el tutor viejo manda 3 respuestas sueltas
  const respuestasClarificadas = briefing ? `
🧠 Idea central del mensaje: ${briefing.ideaCentral || ""}
🎯 Audiencia a la que te diriges: ${briefing.audiencia || ""}
🎁 Transformación que se busca: ${briefing.transformacion || ""}
📖 Historia ancla del predicador: ${briefing.historiaAncla || ""}
⚡ Tensión / objeción real de la audiencia: ${briefing.tension || ""}
⏱ Tiempo disponible: ${briefing.tiempo || ""}
` : `
🧠 Idea central del mensaje: ${respuestas?.[0] || ""}
🎯 Audiencia a la que te diriges: ${respuestas?.[1] || ""}
🎁 Propósito principal de este mensaje: ${respuestas?.[2] || ""}
`;

  const promptFinal = `
Eres un asistente experto en la creación y estructuración de sermones y mensajes persuasivos. Entiendes que un mensaje se compone de 8 pilares interconectados, donde la transición y coherencia entre ellos es fundamental para el impacto. Los pilares son: TÍTULO, INTRODUCCIÓN, COSTURA, PROBLEMÁTICA, CONECTOR, DESARROLLO, CONCLUSIÓN, MINISTRACIÓN.

Tu objetivo es generar el contenido para una sección específica, asegurando que se integre armónicamente con el contexto previo proporcionado, prestando especial atención a las relaciones lógicas y de dependencia entre secciones.

--------------------
SECCIÓN A DESARROLLAR: "${seccionActual}"
--------------------

📌 **Propósito clave de esta sección:** ${propositoSeccionActual}
📌 Instrucción específica para la sección "${seccionActual}":
${promptBase}

🗣 Tono esperado (Estilo "Living Room"):
${tonoLivingRoom}

📋 Información base proporcionada por el usuario:
${respuestasClarificadas}

📚 Contexto de secciones anteriores ya desarrolladas:
${contextoParaPrompt}

${indicacionesDeConexion}
🎯 Tu tarea:
1.  Escribe el CONTENIDO de la sección "${seccionActual}", tal como iría en la prédica.
    Lo que devuelvas SE GUARDA como esa sección del mensaje: es el texto en sí, no una
    propuesta sobre el texto. Escríbelo listo para leerse o decirse.
    ${seccionActual === "COSTURA" ? `**Para "COSTURA": una ÚNICA FRASE, concisa y directa, sin adornos.**` : ''}
    ${seccionActual === "TITULO" ? `**Para "TÍTULO": UNA SOLA LÍNEA. Solo el título, sin comillas, sin subtítulo, sin alternativas y sin explicación. Nada más que la línea.**` : ''}
2.  PROHIBIDO todo meta-comentario. No escribas encabezados como "## Sugerencia de ${seccionActual}",
    "Título principal recomendado", "Por qué este título funciona", "Análisis:", "Evaluación:",
    ni notas sobre tus decisiones, ni versiones alternativas, ni indicaciones de duración.
    El predicador quiere el texto, no la explicación de cómo lo escribiste.
${SECCIONES_DE_UNA_LINEA.has(seccionActual)
  ? `3.  NO agregues el párrafo "🔗 Conexión con lo anterior:" ni ningún otro comentario.
    Esta sección es de una sola línea y se guarda tal cual: cualquier cosa que añadas
    después queda dentro del mensaje. Devuelve la línea y nada más.`
  : `3.  Al final, y solo al final, agrega el párrafo "🔗 Conexión con lo anterior:" donde expliques
    en 1 a 3 frases cómo esta sección se apoya en las anteriores. ${seccionesRelevantesParaConectar.length > 0 ? `Enfócate en la conexión con ${seccionesRelevantesParaConectar.join(' y ')}, priorizando según el "ENFOQUE DE CONEXIÓN", y nombra el **tipo de conexión** (por ejemplo "conexión temática" o "transición fluida").` : 'Si no hay secciones previas, di simplemente que es el punto de partida.'}
    Ese párrafo es lo ÚNICO que puede hablar sobre el mensaje en vez de ser el mensaje.`}
4.  Aplica el ESTILO LIVING ROOM de arriba. No es un adorno: es la forma de la sección.
5.  Solo en la sección INTRODUCCIÓN, cierra el contenido con 3 versículos centrales relacionados
    con el tema, listados al final de la sección.

Empieza directamente con el contenido de "${seccionActual}". Sin preámbulos.
`;

  console.log("--- PROMPT FINAL ENVIADO A CLAUDE PARA GENERAR SUGERENCIA ---");
  console.log(promptFinal);
  console.log("--- FIN DEL PROMPT ---");

  try {
    const sugerencia = await generarTexto(promptFinal, `Escribe la sugerencia para la sección ${seccionActual}.`);
    res.json({ sugerencia, contextoEnviadoAlPrompt: contextoPrevio });
  } catch (error) {
    console.error("❌ Error generando sugerencia:", error);
    const errorMessage = error.response ? error.response.data : error.message;
    console.error("Detalle del error de Claude:", errorMessage);
    res.status(500).json({ error: mensajeDeError(error) });
  }
});

