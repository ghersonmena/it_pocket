# Servicio push opcional de ITPocket. Se construye desde la raíz del proyecto porque reutiliza el
# cliente de GLPI y las reglas de avisos de la app (src/services, src/types).
FROM node:22-alpine

# Zona horaria (GLPI guarda las fechas en hora local): se fija con TZ en docker-compose
RUN apk add --no-cache tzdata

WORKDIR /app/push-service
COPY push-service/package.json push-service/package-lock.json ./
RUN npm ci --omit=dev

COPY src/types /app/src/types
COPY src/services /app/src/services
COPY push-service/src ./src

ENV PUSH_DATA_DIR=/data
EXPOSE 8080
CMD ["npm", "start"]
