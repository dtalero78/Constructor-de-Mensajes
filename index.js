// index.js

require('dotenv').config();

const { OpenAI } = require('openai');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const detect = require('detect-port').default;
const { exec } = require("child_process");
const path = require("path");
const db = require('./database');

const app = express();
const upload = multer({ dest: 'uploads/' });
const DEFAULT_PORT = 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

console.log("🔍 API Key detectada:", process.env.OPENAI_API_KEY ? "✅ Sí" : "❌ No");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const tonoLivingRoom = `
  🎙️ Recuerda que el estilo de este mensaje debe reflejar el tono característico de la comunidad Living Room, que se define así:
  
  - Cercano y conversacional, como una charla con un amigo.
  - Honestidad y vulnerabilidad, compartiendo testimonios reales.
  - Uso de imágenes visuales simples y ejemplos cotidianos.
  - Inspirador pero sin exageración ni frases vacías.
  - Lenguaje que incluya y conecte con la audiencia (“nosotros”, “a ti y a mí”).
  - Referencias bíblicas contadas como parte de una historia personal.
  
  Asegúrate de que esta sección respete y refleje este estilo en su contenido y forma.
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
    promptsCalibracion = jsonData.promptsCalibracion;
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
  const promptBase = promptsCalibracion[section] || "";

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
    if (clave !== section && clave !== "usuario" && valor?.trim?.()) {
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
  4. Refiere el tono de la comunidad Living Room, que se caracteriza por ser cercano y conversacional, con honestidad y vulnerabilidad, usando imágenes visuales simples y ejemplos cotidianos. El lenguaje debe incluir y conectar con la audiencia. 
  
  ${tonoLivingRoom}
  `;


  console.log("📤 PROMPT COMPLETO ENVIADO A OPENAI:\n" + promptFinal);


  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: promptFinal }]
    });
    return response.choices[0].message.content;
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
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }]
    });
    return response.choices[0].message.content;
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
app.post('/evaluar-escrito', async (req, res) => {
  const { section, texto, usuario } = req.body;

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
app.post("/aplicar-sugerencias", async (req, res) => {
  const { transcripcion, evaluacion, seccion, usuario } = req.body;
  if (!transcripcion || !evaluacion || !seccion || !usuario) {
    return res
      .status(400)
      .json({ error: "Faltan la transcripción, la evaluación, la sección o el usuario." });
  }

  // Obtener el prompt inicial correspondiente a la sección
  const promptInicial = promptsCalibracion[seccion] || "";

  // Obtener contexto desde base de datos (otras secciones del mensaje)
  let contexto = "";
  try {
    const mensajeDesdeDB = await obtenerMensajeDesdeBase(usuario);
    if (mensajeDesdeDB) {
      for (const [clave, valor] of Object.entries(mensajeDesdeDB)) {
        if (clave !== seccion && clave !== "usuario" && valor?.trim?.()) {
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
  4. Refiere el tono de la comunidad Living Room, que se caracteriza por ser cercano y conversacional, con honestidad y vulnerabilidad, usando imágenes visuales simples y ejemplos cotidianos. El lenguaje debe incluir y conectar con la audiencia. 

  ${tonoLivingRoom}
  `;



  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: promptFinal }]
    });
    const sugerida = response.choices[0].message.content;
    res.json({ transcripcionSugerida: sugerida });
  } catch (error) {
    console.error("❌ Error al aplicar sugerencias:", error);
    res.status(500).json({ error: "No se pudo aplicar las sugerencias." });
  }
});



// Ruta para guardar un mensaje completo (usuario, fecha, y secciones)
app.post('/guardar-mensaje', (req, res) => {
  const {
    usuario,
    titulo,
    introduccion,
    costura,
    problematica,
    conector,
    desarrollo,
    conclusion,
    ministracion
  } = req.body;

  if (!usuario) {
    return res.status(400).json({ error: "El usuario es obligatorio" });
  }

  // 1. Busca el último registro de ese usuario (si existe)
  const querySelect = `
      SELECT *
      FROM mensajes
      WHERE usuario = ?
      ORDER BY fecha_mensaje DESC
      LIMIT 1
    `;

  db.get(querySelect, [usuario], (err, row) => {
    if (err) {
      console.error("Error al buscar mensaje:", err);
      return res.status(500).json({ error: "Error al buscar mensaje" });
    }

    // 2. Si no existe registro para ese usuario, hacemos INSERT
    if (!row) {
      const queryInsert = `
          INSERT INTO mensajes (
            usuario,
            titulo,
            introduccion,
            costura,
            problematica,
            conector,
            desarrollo,
            conclusion,
            ministracion
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
      db.run(
        queryInsert,
        [
          usuario,
          titulo || "",
          introduccion || "",
          costura || "",
          problematica || "",
          conector || "",
          desarrollo || "",
          conclusion || "",
          ministracion || ""
        ],
        function (err2) {
          if (err2) {
            console.error("Error al guardar el mensaje:", err2.message);
            return res.status(500).json({ error: "Error al guardar el mensaje" });
          }
          // this.lastID -> ID del nuevo registro
          return res.json({ success: true, id: this.lastID });
        }
      );
    }
    // 3. Si sí existe, hacemos un UPDATE parcial
    else {
      // Para no perder datos, usamos lo que venga nuevo o mantenemos el que ya estaba
      const updatedTitulo = titulo || row.titulo;
      const updatedIntroduccion = introduccion || row.introduccion;
      const updatedCostura = costura || row.costura;
      const updatedProblematica = problematica || row.problematica;
      const updatedConector = conector || row.conector;
      const updatedDesarrollo = desarrollo || row.desarrollo;
      const updatedConclusion = conclusion || row.conclusion;
      const updatedMinistracion = ministracion || row.ministracion;

      const queryUpdate = `
          UPDATE mensajes
          SET
            titulo         = ?,
            introduccion   = ?,
            costura        = ?,
            problematica   = ?,
            conector       = ?,
            desarrollo     = ?,
            conclusion     = ?,
            ministracion   = ?,
            fecha_mensaje  = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
      db.run(
        queryUpdate,
        [
          updatedTitulo,
          updatedIntroduccion,
          updatedCostura,
          updatedProblematica,
          updatedConector,
          updatedDesarrollo,
          updatedConclusion,
          updatedMinistracion,
          row.id // se actualiza el registro existente
        ],
        function (err3) {
          if (err3) {
            console.error("Error al actualizar el mensaje:", err3.message);
            return res.status(500).json({ error: "Error al actualizar el mensaje" });
          }
          return res.json({ success: true, id: row.id });
        }
      );
    }
  });
});


// Ruta para obtener todos los mensajes guardados
app.get('/obtener-mensajes', (req, res) => {
  db.all("SELECT * FROM mensajes ORDER BY fecha_mensaje DESC", [], (err, rows) => {
    if (err) {
      console.error("❌ Error al obtener mensajes:", err.message);
      return res.status(500).json({ error: "Error al obtener mensajes" });
    }
    res.json(rows);
  });
});

// Ruta para obtener la última nota guardada de un usuario
app.get('/obtener-ultimo-mensaje', (req, res) => {
  const { usuario } = req.query;

  if (!usuario) {
    return res.status(400).json({ error: "El parámetro 'usuario' es obligatorio" });
  }

  // Traemos la última nota guardada de ese usuario
  const query = `
      SELECT *
      FROM mensajes
      WHERE usuario = ?
      ORDER BY fecha_mensaje DESC
      LIMIT 1
    `;

  db.get(query, [usuario], (err, row) => {
    if (err) {
      console.error("Error al obtener último mensaje:", err);
      return res.status(500).json({ error: "Error al obtener mensaje" });
    }

    if (!row) {
      // Si no se encontró ninguna nota
      return res.json({ success: false, message: "No se encontraron notas para este usuario." });
    }

    // Devolvemos el registro
    return res.json({ success: true, mensaje: row });
  });
});


// Ruta para actualizar la calibración de prompts
app.post("/actualizar-calibracion", (req, res) => {
  const nuevosPrompts = req.body;
  if (typeof nuevosPrompts !== "object") {
    return res.status(400).json({ error: "Formato inválido." });
  }
  promptsCalibracion = { ...promptsCalibracion, ...nuevosPrompts };
  savePrompts();
  console.log("✅ Prompts de calibración actualizados:", promptsCalibracion);
  res.json({ success: true, promptsCalibracion });
});

// Endpoint para convertir texto a audio (TTS)
app.post('/api/tts', async (req, res) => {
  try {
    const { model, input } = req.body;
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
  return new Promise((resolve, reject) => {
    const query = `
      SELECT *
      FROM mensajes
      WHERE usuario = ?
      ORDER BY fecha_mensaje DESC
      LIMIT 1
    `;
    db.get(query, [usuario], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}



// Servir index.html SOLO para rutas que NO son archivos estáticos
app.get('*', (req, res, next) => {
  const isStaticAsset = req.path.includes('.') || req.path.startsWith('/api');
  if (isStaticAsset) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Detectar puerto libre y lanzar servidor
detect(3000).then(freePort => {
  app.listen(freePort, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${freePort}`);
  });
}).catch(err => {
  console.error("❌ Error al detectar puerto libre:", err);
});

app.post('/clasificar-idea', async (req, res) => {
  const { idea, usuario } = req.body;

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
          if (clave !== "usuario" && valor?.trim?.()) {
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
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }]
    });

    const clasificacion = response.choices[0].message.content;
    res.json({ clasificacion });
  } catch (error) {
    console.error("Error al clasificar la idea:", error);
    res.status(500).json({ error: "Error al clasificar la idea." });
  }
});



// ✅ PARA ALPHA `generar-una-sugerencia` sin calificación y con contexto visible

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

app.post('/generar-una-sugerencia', async (req, res) => {
  const { seccion, respuestas, contextoPrevio = {} } = req.body;

  const seccionActual = seccion.toUpperCase();
  const promptBase = promptsCalibracion[seccionActual] || "";

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

  const respuestasClarificadas = `
🧠 Idea central del mensaje: ${respuestas[0]}
🎯 Audiencia a la que te diriges: ${respuestas[1]}
🎁 Propósito principal de este mensaje: ${respuestas[2]}
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
🎯 Tu tarea es la siguiente:
1.  Redacta una sugerencia de contenido detallada y creativa para la sección "${seccionActual}", **ajustándose estrictamente a su propósito clave** y siguiendo la instrucción específica y el tono "Living Room".
    ${seccionActual === "COSTURA" ? `**IMPORTANTE: Para la sección "COSTURA", la sugerencia DEBE ser una ÚNICA FRASE, muy concisa y directa, sin adornos ni explicaciones adicionales. Ve al grano.**` : ''}
2.  Después de la sugerencia de contenido, incluye un párrafo OBLIGATORIO titulado "🔗 Conexión con lo anterior:" donde expliques de forma concisa (1-3 frases) cómo esta sugerencia para "${seccionActual}" se vincula y construye sobre las secciones previas. ${seccionesRelevantesParaConectar.length > 0 ? `En tu explicación, enfócate especialmente en la conexión con ${seccionesRelevantesParaConectar.join(' y ')}, **priorizando las conexiones que se consideran más importantes según el "ENFOQUE DE CONEXIÓN" provisto**. Menciona explícitamente el **tipo de conexión** (ej., "conexión temática", "transición fluida") para cada sección relevante.` : 'Si no hay contexto previo relevante o secciones clave identificadas, simplemente indica que es el punto de partida.'}
3.  Aplica el tono "Living Room" consistentemente. Sé claro, visual, cercano y práctico.
4.  NO incluyas frases como "Análisis:", "Evaluación:", "Calificación:", "Puntuación:" o similares. Ve directo a la sugerencia y su explicación de conexión.
5.  Asegúrate de que la sugerencia sea útil y directamente aplicable por el usuario.
6.  Solo en la sección de INTRODUCCIÓN sugiere 3 versículos centrales que se relacionen con el tema del mensaje.

Comienza directamente con la sugerencia para "${seccionActual}".
`;

 console.log("--- PROMPT FINAL ENVIADO A OPENAI PARA GENERAR SUGERENCIA ---");
  console.log(promptFinal);
  console.log("--- FIN DEL PROMPT ---");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: promptFinal }]
    });

    const sugerencia = completion.choices[0].message.content;
    res.json({ sugerencia, contextoEnviadoAlPrompt: contextoPrevio });
  } catch (error) {
    console.error("❌ Error generando sugerencia:", error);
    const errorMessage = error.response ? error.response.data : error.message;
    console.error("Detalle del error de OpenAI:", errorMessage);
    res.status(500).json({ error: "Error al generar la sugerencia. Intenta de nuevo más tarde.", detalle: errorMessage });
  }
});

