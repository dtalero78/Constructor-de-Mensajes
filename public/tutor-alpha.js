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
    try {
      const response = await fetch('/generar-sugerencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas: answers })
      });

      const data = await response.json();
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
      <p>${suggestion}</p>
    `;
    historyDiv.appendChild(card);
  }
}

showQuestion();
```

<style>
  .suggestion-card {
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1em;
    margin-bottom: 1em;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .suggestion-card h4 {
    margin: 0 0 0.5em;
    font-size: 1.1em;
    color: #333;
  }
  .suggestion-card p {
    margin: 0;
    font-size: 0.95em;
    color: #555;
  }
</style>