const questions = [
  "¿Cuál es la idea principal de tu mensaje?",
  "¿A quién va dirigido este mensaje?",
  "¿Qué esperas lograr con este mensaje?"
];

let currentStep = 0;
const answers = {};
const sugerenciasAcumuladas = {};

// Muestra y oculta el loader
function mostrarLoader() {
  document.getElementById('loader').style.display = 'block';
}

function ocultarLoader() {
  document.getElementById('loader').style.display = 'none';
}

function showQuestion() {
  document.getElementById('tutorQuestion').innerText = questions[currentStep];
  document.getElementById('tutorAnswer').value = answers[currentStep] || "";
}

document.getElementById('tutorNext').addEventListener('click', async () => {
  const answer = document.getElementById('tutorAnswer').value.trim();
  if (!answer) {
    alert("Por favor, responde la pregunta.");
    return;
  }

  answers[currentStep] = answer;

  if (currentStep < questions.length - 1) {
    currentStep++;
    showQuestion();
  } else {
    console.log("📤 Iniciando generación por secciones con:", answers);
    document.getElementById('tutorNext').style.display = 'none';
    await generarSugerenciasPorSeccion();
  }
});

async function generarSugerenciasPorSeccion() {
  const secciones = [
    "titulo", "introduccion", "costura",
    "problematica", "conector", "desarrollo",
    "conclusion", "ministracion"
  ];

  const historyDiv = document.getElementById('tutorHistory');
  historyDiv.innerHTML = "<h3>Sugerencias Generadas:</h3>";

  for (const seccion of secciones) {
    await generarSugerenciaParaSeccion(seccion);
  }
}

async function generarSugerenciaParaSeccion(seccion) {
  mostrarLoader();
  try {
    const response = await fetch('/generar-una-sugerencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seccion, respuestas: answers, contextoPrevio: sugerenciasAcumuladas })
    });

    const data = await response.json();
    if (!data.sugerencia) return;

    sugerenciasAcumuladas[seccion] = data.sugerencia;

    let contenido = data.sugerencia;
    let conexion = "";

    const match = data.sugerencia.match(/🔗?\s*Conexi[oó]n con lo anterior[:：]?\s*/i);
    if (match) {
      const partes = data.sugerencia.split(match[0]);
      contenido = partes[0]?.trim() || "";
      conexion = (partes[1] || "").replace(/^🔗?\s*/, '').trim(); // elimina ícono si quedó
    }

    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.innerHTML = `
      <h4>${seccion.toUpperCase()}</h4>
      <div class="editable-content" contenteditable="true" id="contenido-${seccion}">
        ${formatOpenAiText(contenido)}
      </div>
      ${conexion ? `
        <details>
          <summary>🔗 Conexión con lo anterior</summary>
          <div class="editable-connection">${formatOpenAiText(conexion)}</div>
        </details>` : ""}
      <div class="button-row">
        <button onclick="guardarSeccion('${seccion}')">Guardar sección</button>
        <button onclick="regenerarSugerencia('${seccion}')">Nueva sugerencia</button>
      </div>
    `;

    document.getElementById('tutorHistory').appendChild(card);
  } catch (err) {
    console.error(`❌ Error al generar sugerencia para ${seccion}:`, err);
  } finally {
    ocultarLoader();
  }
}

window.guardarSeccion = async function (seccion) {
  const contenido = document.getElementById(`contenido-${seccion}`)?.innerText || "";
  const usuario = prompt("Escribe tu nombre de usuario para guardar esta sección:");
  if (!usuario || !contenido.trim()) return alert("Usuario y contenido requerido.");

  const mensaje = {
    usuario,
    titulo: "", introduccion: "", costura: "", problematica: "",
    conector: "", desarrollo: "", conclusion: "", ministracion: ""
  };
  mensaje[seccion] = contenido.trim();

  mostrarLoader();
  try {
    const response = await fetch('/guardar-mensaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mensaje)
    });

    const result = await response.json();
    if (result.success) alert("✅ Sección guardada correctamente.");
    else alert("❌ Error al guardar sección.");
  } catch (err) {
    console.error("❌ Error al guardar sección:", err);
    alert("❌ Hubo un error guardando la sección.");
  } finally {
    ocultarLoader();
  }
};

window.regenerarSugerencia = async function (seccion) {
  const card = document.getElementById(`contenido-${seccion}`)?.closest('.suggestion-card');
  if (card) card.remove();
  await generarSugerenciaParaSeccion(seccion);
};

function formatOpenAiText(text) {
  if (!text) return "";
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  formatted = formatted.replace(/^- (.*)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

showQuestion();
