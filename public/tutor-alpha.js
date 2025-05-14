const questions = [
  "¿Cuál es la idea principal de tu mensaje?",
  "¿A quién va dirigido este mensaje?",
  "¿Qué esperas lograr con este mensaje?"
];

let currentStep = 0;
const answers = {};
const secciones = [
  "titulo",
  "introduccion",
  "costura",
  "problematica",
  "conector",
  "desarrollo",
  "conclusion",
  "ministracion"
];

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
    // Cuando ya tienes las respuestas, empieza a generar sugerencias
    console.log("📤 Enviando respuestas:", answers);
    generarSugerenciasUnaPorUna();
  }
});

async function generarSugerenciasUnaPorUna() {
  const historyDiv = document.getElementById('tutorHistory');
  historyDiv.innerHTML = "<h3>Sugerencias Generadas:</h3>";

  for (const seccion of secciones) {
    try {
      const response = await fetch('/generar-una-sugerencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seccion,
          respuestas: answers
        })
      });

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const errorText = await response.text();
        console.error("⚠️ Respuesta no es JSON:", errorText);
        continue;
      }

      const data = await response.json();
      console.log(`✅ Sugerencia recibida para ${seccion}:`, data);

      const card = document.createElement('div');
      card.className = 'suggestion-card';
      card.innerHTML = `
        <h4>${seccion.toUpperCase()}</h4>
        <p>${formatOpenAiText(data.sugerencia)}</p>
      `;
      historyDiv.appendChild(card);

    } catch (error) {
      console.error(`❌ Error generando sugerencia para ${seccion}:`, error);
    }
  }
}

// Función para formatear texto (negritas y saltos de línea)
function formatOpenAiText(text) {
  if (!text) return "";
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

showQuestion();
