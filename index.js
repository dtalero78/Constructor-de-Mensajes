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

// Objeto global para almacenar las transcripciones de cada sección
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

// Configuración de prompts de calibración
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
async function evaluarTranscripcion(transcripcion, section) {
    const prompt = promptsCalibracion[section] || "";
    const promptFinal = prompt.includes("[transcripción]")
        ? prompt.replace("[transcripción]", transcripcion)
        : prompt + "\n\nTexto a evaluar:\n" + transcripcion;

    console.log("Prompt final para sección", section, ":", promptFinal);
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
    const { section, texto } = req.body;
    if (!texto) {
        return res.status(400).json({ error: "El texto es requerido." });
    }
    console.log(`Evaluando texto en la sección "${section}":`);
    console.log(texto);
    try {
        const evaluacion = await evaluarTranscripcion(texto, section);
        console.log("Respuesta de la evaluación:");
        console.log(evaluacion);
        res.json({ evaluacion });
    } catch (error) {
        console.error("Error en /evaluar-escrito:", error);
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
    const { transcripcion, evaluacion, seccion } = req.body;
    if (!transcripcion || !evaluacion || !seccion) {
      return res
        .status(400)
        .json({ error: "Faltan la transcripción, la evaluación o la sección." });
    }
  
    // Obtener el prompt inicial correspondiente a la sección
    const promptInicial = promptsCalibracion[seccion] || "";
  
    // Construir el prompt final integrando el prompt inicial, la transcripción y la evaluación
    const promptFinal = `
  Eres un asistente de escritura experto.
  Considera el siguiente prompt inicial para la sección "${seccion}":
  "${promptInicial}"
  
  A continuación, tienes la transcripción original:
  "${transcripcion}"
  
  Y estas son las sugerencias para mejorarla:
  "${evaluacion}"
  
  Tu tarea es producir una nueva versión de la transcripción que incorpore las sugerencias de manera coherente y clara, siguiendo las indicaciones del prompt inicial.
  
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
        const updatedTitulo        = titulo        || row.titulo;
        const updatedIntroduccion  = introduccion  || row.introduccion;
        const updatedCostura       = costura       || row.costura;
        const updatedProblematica  = problematica  || row.problematica;
        const updatedConector      = conector      || row.conector;
        const updatedDesarrollo    = desarrollo    || row.desarrollo;
        const updatedConclusion    = conclusion    || row.conclusion;
        const updatedMinistracion  = ministracion  || row.ministracion;
  
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
    const { model, voice, input } = req.body;
    // Llamada a la API de OpenAI para generar el audio
    const mp3 = await openai.audio.speech.create({
      model,   // "tts-1" o "tts-1-hd"
      voice,   // Por ejemplo "alloy"
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

// Servir index.html desde la carpeta public
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Detectar puerto libre y lanzar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
