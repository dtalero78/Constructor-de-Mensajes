# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

"Constructor de Mensajes" (Speakers Living Room): app Express monolítica que ayuda a construir prédicas
sección por sección. Un agente entrevista al predicador, arma un briefing y a partir de ahí escribe los
8 pilares del mensaje, encadenando cada uno con los anteriores. Todo el texto lo genera **Claude**
(`claude-opus-5`) contra un prompt de calibración por sección.

Todo el dominio está en español y los nombres de secciones son literales del código, no traducciones.

## Comandos

```bash
npm install --ignore-scripts && npm rebuild sqlite3   # ver "Instalación" abajo: npm install pelado falla
node index.js            # no hay script "start"; arranca en :3000 (o el siguiente libre vía detect-port)
node testOpenAi.js       # smoke test viejo de OpenAI; solo aplica al audio
docker build -t constructor . && docker run -p 3000:3000 --env-file .env constructor
```

- Requiere `.env` con:
  - `ANTHROPIC_API_KEY` — todo el texto pasa por Claude.
  - `DATABASE_URL` — Postgres (cluster `bslpostgres` en DigitalOcean, base `speakers`).
  - `OPENAI_API_KEY` — **opcional**, para todo lo que es voz: Whisper, TTS y la entrevista hablada
    (Anthropic no tiene ninguna de las tres). Sin ella la app arranca igual; `/transcribir` y
    `/api/tts` responden 503 y la entrevista por voz queda deshabilitada.
- **La base exige VPN**: el firewall del cluster solo deja pasar `174.138.59.209`. Sin el túnel
  `wg-bsl-vpn` activo, el arranque avisa que no pudo conectar.
- ffmpeg en el PATH solo hace falta para `/transcribir`.
- **No hay tests ni linter.** `npm test` falla a propósito.

### Instalación: `npm install` falla en Node moderno

Dos escollos encadenados, ambos verificados en Node 24 / macOS arm64:

1. **`better-sqlite3` no compila** y aborta el install entero. Es una **dependencia muerta**: ningún archivo
   la importa ([database.js](database.js) usa `sqlite3`). Se puede saltar sin consecuencias, o borrarla de
   `package.json`, que es el arreglo de verdad.
2. El `node-gyp@8.4.1` que viene vendorizado importa `distutils`, **eliminado en Python ≥3.12**. Afecta a
   `sqlite3`, que sí hace falta. Si `npm rebuild sqlite3` falla por `ModuleNotFoundError: No module named
   'distutils'`, dale un Python con el shim y reintenta:

   ```bash
   python3 -m venv /tmp/gypvenv && /tmp/gypvenv/bin/pip install -q "setuptools<81"
   PYTHON=/tmp/gypvenv/bin/python npm rebuild sqlite3
   ```

Ojo con `--ignore-scripts`: también salta el `node-pre-gyp` de `sqlite3` y deja el paquete **sin binding**
(`Could not locate the bindings file`), de ahí el `npm rebuild sqlite3` obligatorio a continuación.

## Arquitectura

Tres archivos hacen todo el trabajo:

- [index.js](index.js) — servidor Express completo: rutas, prompts, llamadas a Claude. Sin capas.
- [database.js](database.js) — pool de Postgres (`pg`) y las consultas del dominio. Hacia afuera devuelve la
  fila "plana" con los 8 pilares como columnas, que es lo que espera el front; por dentro está normalizado.
- [public/home.html](public/home.html) — la portada: accesos, "Mis mensajes" y los 8 pilares.
- [public/crear.html](public/crear.html) — el agente entrevistador y el mensaje: entrevista → briefing →
  las 8 secciones como tarjetas editables → consolidado con PDF.
- [public/ideas.html](public/ideas.html) — clasifica una idea suelta en uno de los 8 pilares.

**[public/index.html](public/index.html) es el constructor viejo y está retirado**: ningún enlace apunta ahí.
Solo sigue en el repo porque contiene el panel de Calibración de `prompts.json`, que aún no tiene reemplazo.
Lo mismo con `tutor-alpha.html`, sustituido por el agente.

### Los 8 pilares

Toda la app gira alrededor de 8 secciones fijas, en este orden:
`titulo, introduccion, costura, problematica, conector, desarrollo, conclusion, ministracion`.

Aparecen replicadas en cuatro sitios, y **hay que tocarlos todos al añadir o renombrar una sección**:
las columnas de la tabla `mensajes`, las claves de [prompts.json](prompts.json), el grafo
`relacionesImportantes` en [index.js](index.js) y los bloques `<div id="<seccion>">` de la SPA.

### Modelo de datos

Postgres, normalizado (el esquema vive en [db/schema.sql](db/schema.sql)):

```
usuarios  (id, usuario UNIQUE, nombre, creado_en)
mensajes  (id, usuario_id → usuarios, titulo, briefing jsonb, estado, creado_en, actualizado_en)
secciones (id, mensaje_id → mensajes, pilar (enum de los 8), contenido, UNIQUE(mensaje_id, pilar))
```

- Un usuario puede tener **varios mensajes**. `guardarMensaje` decide destino así: `mensajeId` (validando que
  sea de esa persona) → `nuevo: true` (crea uno) → por defecto, el último que tocó.
- **El front tiene que pedir `nuevo: true` en el primer guardado de un mensaje nuevo.** Ese "por defecto"
  es un `ORDER BY actualizado_en DESC LIMIT 1`: si no se pide, empezar un mensaje desde cero escribe
  encima del anterior. `?nuevo=1` limpia el borrador de `localStorage` pero **no** le dice nada a la base.
  `guardarEnBase()` en [crear.html](public/crear.html) manda `nuevo: true` cuando no hay `mensajeId` y se
  queda con el `id` que responde el servidor, para que las otras siete secciones vayan a ese mismo mensaje.
- Las secciones que llegan vacías **se dejan como estaban**: el front manda los 8 pilares y solo llena el que
  se editó. Vaciar una sección a propósito requiere ir por SQL.
- `mensajes.titulo` es un espejo del pilar `titulo`, para poder listar sin join. La fuente de verdad es
  `secciones`.
- No hay autenticación: el usuario es el nombre que se escribe al entrar, guardado en `localStorage`.
  `/obtener-mensajes` sin `?usuario=` devuelve los mensajes de **todo el mundo**.
- `database.sqlite` es la base vieja, ya sin uso. La migración de sus datos está en
  [db/migrar-desde-sqlite.js](db/migrar-desde-sqlite.js) y es idempotente por (usuario, fecha).

### Prompts y contexto

[prompts.json](prompts.json) guarda la instrucción de calibración por sección y se lee **en memoria al
arrancar** (`loadPrompts()`); `/actualizar-calibracion` mergea y reescribe el archivo en disco.

El patrón que se repite en todos los endpoints de IA: se levanta la fila del usuario con
`obtenerMensajeDesdeBase()`, se serializan las **otras** secciones como contexto, y se concatena
`promptBase + contexto + tonoLivingRoom + tarea` en un solo mensaje `role: "system"` a `gpt-4o`.

`tonoLivingRoom` es la constante de estilo de la comunidad y debe ir en cualquier prompt nuevo que genere
o reescriba texto de una prédica.

`relacionesImportantes` (final de [index.js](index.js)) es un grafo de dependencias entre pilares
(`dependsOn` + `type` + `weight`) que solo usa `/generar-una-sugerencia` para decirle al modelo con qué
secciones previas conectar y en qué orden de prioridad.

### Caja de las claves de calibración

`prompts.json` usa claves canónicas en **MAYÚSCULAS** (`"TITULO"`), pero las secciones viajan en minúsculas
por todo lo demás: los `data-pilar` de las tarjetas y el enum `pilar` de Postgres.

La conversión está centralizada en un único accesor por lado; **usarlo siempre en vez de indexar directo**:

- Backend — `normalizarSeccion()`, `normalizarClavesPrompts()` y `obtenerPromptCalibracion()` en
  [index.js](index.js). `loadPrompts()` normaliza al leer y `/actualizar-calibracion` normaliza lo que
  entra, así que el archivo no puede acabar con claves duplicadas en minúsculas.
- Frontend — `normalizarSeccion()` y `obtenerPromptCalibracion()` en [public/index.html](public/index.html).

Ojo con el doble uso de la variable `section` en `evaluarTranscripcion()` y `/aplicar-sugerencias`: además
del lookup de calibración sirve para **excluir la sección actual** del contexto que se arma iterando las
columnas de la fila. Esa comparación también se normaliza; si se toca, mantener ambos lados normalizados o
la sección que se está evaluando se cuela en su propio contexto.

Un detalle heredado del mismo bucle: `fecha_mensaje` entra al contexto como si fuera una sección
(solo se excluyen `usuario` y la sección actual; `id` se cae solo porque es número y no tiene `.trim`).

## Estado global compartido

`transcripciones` y `preguntasIniciales` son objetos a nivel de módulo, compartidos por **todos** los
usuarios del proceso. `/transcribir` escribe en `transcripciones` y llama a `evaluarTranscripcion` sin el
argumento `usuario`, así que evalúa sin contexto de BD. `/ver-preguntas` devuelve siempre un objeto vacío.
El flujo real y mantenido es el de texto (`/evaluar-escrito`, `/aplicar-sugerencias`), no el de audio.

## Rutas

| Ruta | Qué hace |
|---|---|
| `POST /transcribir` | multipart `audio` + `section` → ffmpeg → Whisper → evalúa (flujo legacy) |
| `POST /evaluar-escrito` | `{section, texto, usuario}` → crítica de la sección con contexto de BD |
| `POST /aplicar-sugerencias` | reescribe el texto incorporando la evaluación |
| `POST /generar-una-sugerencia` | genera una sección desde cero usando `relacionesImportantes` |
| `POST /clasificar-idea` | clasifica una idea suelta en uno de los 8 pilares |
| `POST /analizar-curva` | juicio cualitativo de los 6 tramos de la curva. JSON validado por esquema |
| `POST /agente/entrevista` | el entrevistador. Devuelve **JSON validado por esquema**, no prosa |
| `POST /agente/voz/token` | token efímero de OpenAI Realtime para la entrevista hablada |
| `POST /guardar-mensaje` | upsert por pilar. Acepta `mensajeId` o `nuevo: true` |
| `GET /obtener-mensajes` | con `?usuario=` filtra; **sin él devuelve los de todos** |
| `GET /obtener-ultimo-mensaje`, `GET /obtener-mensaje?id=&usuario=` | el mensaje en curso, o uno concreto |
| `GET /obtener-calibracion`, `POST /actualizar-calibracion` | leer/escribir `prompts.json` |
| `POST /api/tts` | OpenAI TTS, voz fija `"ash"`, devuelve `audio/mpeg` |
| `GET *` | catch-all → `public/index.html` salvo que la ruta tenga `.` o empiece por `/api` |

## Frontend

Sin bundler: se edita el `<script>` inline de cada página. Dependencia externa: `html2pdf` por CDN.
Las piezas de JS propias fuera de las páginas son [public/calibracion.js](public/calibracion.js)
y [public/voz.js](public/voz.js).

- `/` → [home.html](public/home.html). El usuario sale de `localStorage.currentUser`.
- `/crear.html` → el agente. `?nuevo=1` empieza en limpio; `?mensaje=<id>` abre ese mensaje sin entrevista;
  `&ver=completo` cae directo en el consolidado. El avance se guarda en `localStorage` **y** en la base.
- `/ideas.html` → clasificar una idea.

Las respuestas del modelo llegan en Markdown y se renderizan con `formatOpenAiText()` (regex a HTML),
que está duplicado en cada página.

### Dos cosas medidas que conviene no romper

1. **`effort: "low"` en `/agente/entrevista` no es por ahorrar.** Salida estructurada + pensamiento
   adaptativo con el esfuerzo por defecto (`high`) devuelve **400 intermitentes**. Medido con la misma
   petición: low 8/8, medium 7/8, high 2/8. Hay además un reintento ante 400, que el SDK no hace solo.
2. **Lo que devuelve `/generar-una-sugerencia` se guarda tal cual como la sección.** Por eso el prompt
   prohíbe el meta-comentario ("## Sugerencia de TÍTULO", "Por qué funciona"). Antes, un título ocupaba
   2282 caracteres de ensayo; ahora, 30.

### El agente saluda por el nombre

`nombreDePila()` y `saludoPersonal()` en [index.js](index.js) sacan el nombre de `req.usuario`, que viene
de la cookie y nunca de lo que mande el navegador. Se añaden al final del prompt en las dos entrevistas.
Si la sesión no tiene nombre no se añade nada, y el agente arranca sin saludo en vez de decir "Hola ".

## Los dos entrevistadores: `materialQueSirve`, no `tonoLivingRoom`

Hay dos constantes de estilo y **no son intercambiables**:

- `tonoLivingRoom` → para los prompts que **escriben** el mensaje. Describe cómo suena una
  prédica: frases cortas, marcadores de escucha, ráfaga de "quizás", prohibido moralizar.
- `materialQueSirve` → para los dos **entrevistadores** (texto y voz). Describe qué material
  vale la pena sacarle al predicador: lo concreto sobre lo abstracto, escenas con cuerpo,
  la derrota abierta antes que la lección aprendida.

Dárselo al revés tiene un efecto medible: un entrevistador con el manual del mensaje empieza a
hablar como púlpito —suelta "escúchame", frases de sermón— en vez de preguntar. Si alguien
"unifica" ambas constantes, eso es lo que vuelve.

### El entrevistador no interroga: propone

La premisa del producto es que el predicador llega **sin** el mensaje armado: trae un versículo
suelto, una inquietud, o casi nada. Por eso los prompts prohíben expresamente:

- pedir conceptos ("¿cuál es tu historia ancla?"): se pregunta por experiencias vividas;
- usar el vocabulario del método delante del predicador ("briefing", "pilares", "tensión");
- quedarse repitiendo una pregunta cuando la respuesta es vaga: hay que **bajarla a lo concreto**
  ("quiero hablar de la fe" → "¿y a ti en qué te está costando creer últimamente?").

Y al revés de lo que decía la versión anterior del prompt, el agente **sí debe proponer**: cuando
entiende algo, se lo devuelve al predicador para que lo confirme o lo corrija. Reconocer es fácil;
producir de la nada es lo que bloquea. El briefing lo compone el agente por inferencia; los seis
campos son su salida, no un formulario que el predicador rellene.

## Entrevista por voz

`crear.html` abre en una pantalla de modo (`pModo`): **escribiendo** (el agente de texto de siempre)
o **hablando**. Los dos caminos terminan en el mismo briefing de seis campos, así que a partir del
briefing el flujo es idéntico.

La voz va por **OpenAI Realtime** (`gpt-realtime-2.1`) sobre WebRTC, porque Anthropic no tiene voz en
tiempo real. Dos decisiones que conviene no deshacer:

- **El navegador nunca ve la `OPENAI_API_KEY`.** `/agente/voz/token` pide a
  `https://api.openai.com/v1/realtime/client_secrets` un token efímero (~1 min) y devuelve solo eso.
- **La sesión se configura entera en el servidor**, dentro de esa misma petición: instrucciones,
  voz, transcripción y la tool. Así el prompt de estilo tampoco viaja al cliente en texto plano.
  Si se moviera al `session.update` del navegador, quedaría a la vista en las DevTools.

El briefing **no se saca parseando la conversación**: el agente llama a la tool `entregar_briefing`
con los seis campos, y [public/voz.js](public/voz.js) lo recoge en el `response.done`. Es mucho más
fiable que interpretar una transcripción, que además llega con erratas.

`semantic_vad` gestiona los turnos (no hay botón de "hablar"), y la transcripción del predicador usa
`gpt-4o-transcribe` en español. Los turnos hablados se guardan en `estado.conversacion` igual que los
escritos, así que se puede salir a la entrevista de texto sin perder lo dicho.

## Calibración del mensaje (la curva)

[public/calibracion.js](public/calibracion.js) es un módulo sin dependencias, compartido por las dos
vistas de [crear.html](public/crear.html): la tira compacta sobre las tarjetas y el panel completo del
consolidado. Se carga **sin `defer`**, porque el `<script>` inline de la página corre antes que los
diferidos y lo usa al pintar.

La idea que sostiene el diseño: **la forma de la curva es fija**. Sale de medir 10 prédicas del corpus
y no depende del mensaje del usuario. Lo que varía es cuánto material tiene cargado cada uno de los
seis tramos, que es lo único medible con conteos sin caer en falso rigor. El módulo **no puntúa la
calidad** del mensaje ni pretende medir emoción; comprueba presencia de señales y lo dice en la UI.

Cada tramo declara de qué pilares se alimenta y una lista de `señales` con `prueba` (regex),
`busca` (qué mira, se enseña al usuario) y `pista` (cómo arreglarlo). Al tocar las señales conviene
probarlas contra textos reales: un patrón estrecho marca como ausente algo que sí está escrito —
pasó con la descarga de la CONCLUSIÓN ("nunca dependió de…" no casaba con "no depende") y con la
declaración de la MINISTRACIÓN, que no siempre empieza por "yo creo".

`/analizar-curva` es la otra mitad y es deliberadamente **a demanda**: la heurística dice si el
material está, el modelo dice si el tramo *funciona*. Usa salida estructurada con `effort: "low"` y
un reintento ante 400, por la misma razón documentada en `/agente/entrevista`.

## Despliegue

DigitalOcean App Platform, build con el Dockerfile. La app es **`constructor-de-mensajes`**
(id `f0ea5d35-2fbd-40a7-8544-069c309e5832`, región nyc) y hoy despliega sola en cada push a la rama
**`interfaz-nueva-postgres-agente`**, no a `main` — [app.yaml](app.yaml) sigue diciendo `main` y ya no
refleja el spec real; la fuente de verdad es `doctl apps spec get`.

- **Dominio: [lvr-speakers.com](https://lvr-speakers.com)** (+ `www`, como ALIAS). El registrador es
  name.com pero el DNS lo sirve DigitalOcean: los nameservers apuntan a `ns1/2/3.digitalocean.com` y los
  registros del apex los crea y mantiene sola la App Platform al declarar el bloque `domains:` del spec.
  **No crear registros a mano en name.com**; se toca el spec y DO reescribe la zona.
- El app-id ya está en el firewall del cluster
  (`doctl databases firewalls append b09c5f55-deb7-439f-a4c6-009006ebe5bc --rule app:<app-id>`); sin esa
  regla el contenedor no ve Postgres, porque por lo demás solo entra la IP de la VPN.
- El login con Google valida por **origen**, no por redirect_uri (Google Identity Services manda un
  `credential` a `/auth/google`). Cada dominio nuevo hay que agregarlo a mano como *Authorized JavaScript
  origin* del cliente OAuth en Google Cloud Console, o el botón revienta con `origin_mismatch`.
- Los datos ya **no** se pierden en cada deploy: viven en Postgres, fuera del contenedor. `prompts.json`
  y `uploads/` sí siguen dentro del contenedor y se revierten al estado del repo en cada despliegue.
- `detect-port` ignora `process.env.PORT`: sondea desde el 3000 hacia arriba. Coincide con el `PORT=3000`
  de la config, pero no lo respeta de verdad.
