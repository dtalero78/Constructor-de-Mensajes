FROM node:18

# Instalar ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app

# Copiamos solo package.json / package-lock.json primero
COPY package*.json ./

# Solo dependencias de producción: sqlite3 quedó en devDependencies (script de
# migración) y compilarlo aquí no aporta nada.
RUN npm install --omit=dev

# Luego copiamos el resto del proyecto
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
