const questions = [
  "¿Cuál es la idea principal de tu mensaje?",
  "¿A quién va dirigido este mensaje?",
  "¿Qué esperas lograr con este mensaje?"
];

let currentStep = 0;
const answers = {};
const sugerenciasAcumuladas = {};

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
    generarSugerenciasPorSeccion();
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
  const match = data.sugerencia.match(/🔗?\s*Conexión con lo anterior[:：]?\s*/i);
  if (match) {
    const partes = data.sugerencia.split(match[0]);
    contenido = partes[0].trim();
    conexion = partes[1]?.trim() || "";
  }

  const card = document.createElement('div');
  card.className = 'suggestion-card';
  card.innerHTML = `
    <h4>${seccion.toUpperCase()}</h4>
    <textarea id="contenido-${seccion}" rows="8" style="width: 100%; border: 1px solid #ccc; border-radius: 6px; padding: 0.5em; font-size: 0.9em;">${contenido}</textarea>
    ${conexion ? `
      <details style="margin-top: 0.8em;">
        <summary style="cursor: pointer; font-size: 0.9em; color: #007acc;">🔗 Conexión con lo anterior</summary>
        <div style="margin-top: 0.5em; font-size: 0.88em; color: #333; background: #eef6fc; padding: 0.6em; border-left: 4px solid #007acc; border-radius: 6px;">
          ${formatOpenAiText(conexion.trim())}
        </div>
      </details>` : ""}
    <div style="margin-top: 10px; display: flex; gap: 10px;">
      <button onclick="guardarSeccion('${seccion}')">💾 Guardar sección</button>
      <button onclick="regenerarSugerencia('${seccion}')">🔁 Nueva sugerencia</button>
    </div>
  `;

  document.getElementById('tutorHistory').appendChild(card);
}

window.guardarSeccion = async function (seccion) {
  const contenido = document.getElementById(`contenido-${seccion}`).value;
  const usuario = prompt("Escribe tu nombre de usuario para guardar esta sección:");
  if (!usuario) return alert("Debes ingresar un nombre.");

  const mensaje = {
    usuario,
    titulo: "", introduccion: "", costura: "", problematica: "",
    conector: "", desarrollo: "", conclusion: "", ministracion: ""
  };
  mensaje[seccion] = contenido;

  const response = await fetch('/guardar-mensaje', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mensaje)
  });

  const result = await response.json();
  if (result.success) alert("✅ Sección guardada correctamente.");
  else alert("❌ Error al guardar sección.");
};

window.regenerarSugerencia = async function (seccion) {
  const card = document.querySelector(`#contenido-${seccion}`)?.closest('.suggestion-card');
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