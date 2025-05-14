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

document.getElementById('tutorNext').addEventListener('click', () => {
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
    // Mostrar área de sugerencias
    const historyDiv = document.getElementById('tutorHistory');
    historyDiv.innerHTML = "<h3>Sugerencias Generadas:</h3>";

    // Enviar respuestas por query como JSON string
    const params = new URLSearchParams({ respuestas: JSON.stringify(answers) });
    const eventSource = new EventSource(`/generar-sugerencias?${params.toString()}`);

    eventSource.addEventListener('sugerencia', (e) => {
      const { seccion, sugerencia } = JSON.parse(e.data);
      const card = document.createElement('div');
      card.className = 'suggestion-card';
      card.innerHTML = `
        <h4>${seccion.toUpperCase()}</h4>
        <p>${formatOpenAiText(sugerencia)}</p>
      `;
      historyDiv.appendChild(card);
    });

    eventSource.addEventListener('done', () => {
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      console.error("❌ Error de SSE:", e);
      eventSource.close();
      alert("Hubo un error al generar sugerencias. Intenta de nuevo.");
    });
  }
});

function formatOpenAiText(text) {
  if (!text) return "";
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

showQuestion();
