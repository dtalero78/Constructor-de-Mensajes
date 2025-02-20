# 1) Seleccionamos una imagen base de Node.js (versión 18 por ejemplo)
FROM node:18

# 2) Instalamos ffmpeg (y otras dependencias que necesites)
RUN apt-get update && apt-get install -y ffmpeg

# 3) Creamos y establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

# 4) Copiamos los archivos de dependencias (package.json, package-lock.json)
COPY package*.json ./

# 5) Instalamos las dependencias de Node
RUN npm install

# 6) Copiamos el resto del código de tu proyecto
COPY . .

# 7) Definimos la variable de entorno PORT (App Platform suele asignar su propio valor)
ENV PORT=3000

# 8) Exponemos el puerto 3000 (no siempre es necesario para App Platform, pero útil localmente)
EXPOSE 3000

# 9) Definimos el comando para arrancar tu aplicación
CMD ["node", "index.js"]
