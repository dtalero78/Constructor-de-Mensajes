const questions = [
  "¿Cuál es la idea principal de tu mensaje?",
  "¿A quién va dirigido este mensaje?",
  "¿Qué esperas lograr con este mensaje?"
];

let currentStep = 0;
const answers = {};

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
    // Enviar respuestas al backend para generar sugerencias
    console.log("📤 Enviando respuestas al backend:", answers);

    try {
      const response = await fetch('/generar-sugerencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas: answers })
      });

      const data = await response.json();
      console.log("📥 Respuesta del backend:", data);

      if (data.sugerencias) {
        displaySuggestions(data.sugerencias);
      } else {
        alert("Error al generar sugerencias.");
      }
    } catch (error) {
      console.error("Error al enviar respuestas:", error);
      alert("Error al generar sugerencias.");
    }
  }
});

function displaySuggestions(suggestions) {
  const historyDiv = document.getElementById('tutorHistory');
  historyDiv.innerHTML = "<h3>Sugerencias Generadas:</h3>";

  for (const [section, suggestion] of Object.entries(suggestions)) {
    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.innerHTML = `
      <h4>${section.toUpperCase()}</h4>
      <p>${formatOpenAiText(suggestion)}</p>
    `;
    historyDiv.appendChild(card);
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