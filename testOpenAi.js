// testOpenAI.js
require('dotenv').config(); // Para leer .env si lo necesitas
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testConnection() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "user", content: "Hola, esto es una prueba de conexión" }]
    });
    console.log("✅ Conexión exitosa. Respuesta:");
    console.log(response);
  } catch (error) {
    console.error("❌ Error al conectarse a OpenAI:", error);
  }
}

testConnection();
