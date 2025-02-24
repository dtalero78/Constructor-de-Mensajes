FROM node:18

# Instalar ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app

# Copiamos solo package.json / package-lock.json primero
COPY package*.json ./

# Install de dependencias en el contenedor
RUN npm install

# Luego copiamos el resto del proyecto
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "index.js"]
