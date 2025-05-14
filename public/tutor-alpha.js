const questions = [
  "¿Cuál es la idea principal de tu mensaje?",
  "¿A quién va dirigido este mensaje?",
  "¿Qué esperas lograr con este mensaje?"
];

let currentStep = 0;
const answers = {};
const sugerenciasAcumuladas = {}; // Aquí acumulamos las sugerencias

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
    // Cuando terminan las preguntas, inicia la generación una por una
    console.log("📤 Iniciando generación por secciones con:", answers);
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

        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.innerHTML = `
          <h4>${seccion.toUpperCase()}</h4>
          <p>${formatOpenAiText(data.sugerencia)}</p>
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
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

showQuestion();
