const questions = [
  "¿Cuál es la idea principal de tu mensaje?",
  "¿A quién va dirigido este mensaje?",
  "¿Qué esperas lograr con este mensaje?",
  // ...agrega más preguntas según el flujo...
];

let currentStep = 0;
const answers = [];

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
    document.getElementById('tutorQuestion').innerText = "¡Has completado el flujo inicial!";
    document.getElementById('tutorAnswer').style.display = "none";
    document.getElementById('tutorNext').style.display = "none";
    document.getElementById('tutorHistory').innerHTML = "<b>Respuestas:</b><br>" + answers.map((a, i) => `<b>${questions[i]}</b><br>${a}`).join("<br><br>");
    // Aquí puedes enviar las respuestas al backend si lo deseas
  }
});

showQuestion();