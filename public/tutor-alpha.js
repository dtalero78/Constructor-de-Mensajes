// Actualiza el archivo public/tutor-alpha.js para permitir edición y guardado de sugerencias

const questions = [
  "¿Cuál es la idea principal de tu mensaje?",
  "¿A quién va dirigido este mensaje?",
  "¿Qué esperas lograr con este mensaje?"
];

let currentStep = 0;
const answers = {};
const sugerenciasAcumuladas = {};
let currentUser = ""; // se pedirá al cargar la página

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
    document.getElementById('tutorNext').style.display = 'none';
    generarSugerenciasPorSeccion();
  }
});

async function guardarSeccionEnBD(seccion, contenido) {
  if (!currentUser) {
    alert("Usuario no definido");
    return;
  }

  const payload = {
    usuario: currentUser,
    [seccion]: contenido
  };

  try {
    const res = await fetch('/guardar-mensaje', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Sección ${seccion} guardada.`);
    } else {
      alert("Error al guardar: " + (data.error || "Desconocido"));
    }
  } catch (error) {
    console.error("Error al guardar:", error);
    alert("Error al guardar en la base de datos");
  }
}

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
        let contenido = data.sugerencia;
        let conexion = "";
        const match = data.sugerencia.match(/\u{1F517}?\s*Conexión con lo anterior[:：]?\s*/iu);
        if (match) {
          const partes = data.sugerencia.split(match[0]);
          contenido = partes[0].trim();
          conexion = partes[1]?.trim() || "";
        }

        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.innerHTML = `
          <h4>${seccion.toUpperCase()}</h4>
          <textarea style="width:100%; height:150px;">${contenido}</textarea>
          <button onclick="guardarSeccionEnBD('${seccion}', this.previousElementSibling.value)">Guardar sección</button>
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
  let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  formatted = formatted.replace(/^- (.*)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

// Preguntar nombre del usuario al cargar la página
window.addEventListener('DOMContentLoaded', () => {
  currentUser = prompt("Ingresa tu nombre de usuario:") || "Usuario";
  showQuestion();
});
