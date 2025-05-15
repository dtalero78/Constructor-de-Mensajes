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
    document.getElementById('tutorNext').style.display = 'none'; // Oculta el botón al finalizar
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
    try {
      const response = await fetch('/generar-una-sugerencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seccion,
          respuestas: answers,
          contextoPrevio: sugerenciasAcumuladas
        })
      });

      const data = await response.json();
      if (data.sugerencia) {
        sugerenciasAcumuladas[seccion] = data.sugerencia;

        // Separar sugerencia y conexión
        const [contenido, conexion] = data.sugerencia.split("🔗 Conexión con lo anterior:");

        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.innerHTML = `
          <h4>${seccion.toUpperCase()}</h4>
          <p>${formatOpenAiText(contenido.trim())}</p>
          ${conexion ? `
            <details style="margin-top: 0.8em;">
              <summary style="cursor: pointer; font-size: 0.9em; color: #007acc;">🔗 Conexión con lo anterior</summary>
              <div style="margin-top: 0.5em; font-size: 0.88em; color: #333; background: #eef6fc; padding: 0.6em; border-left: 4px solid #007acc; border-radius: 6px;">
                ${formatOpenAiText(conexion.trim())}
              </div>
            </details>` : ""}
        `;
        historyDiv.appendChild(card);
      } else {
        console.warn(`⚠️ No se recibió sugerencia para ${seccion}`);
      }
    } catch (error) {
      console.error(`❌ Error generando ${seccion}:`, error);
    }
  }
}


// Formato visual de negritas y saltos de línea
function formatOpenAiText(text) {
  if (!text) return "";

  // Negritas estilo **texto**
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Títulos estilo ### Título
  formatted = formatted.replace(/^### (.*)$/gm, '<h3>$1</h3>');

  // Listas con guiones
  formatted = formatted.replace(/^- (.*)$/gm, '<li>$1</li>');

  // Agrupar listas en <ul>
  formatted = formatted.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');

  // Saltos de línea
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}


showQuestion();
