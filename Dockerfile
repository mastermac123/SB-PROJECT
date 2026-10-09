FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/lib ./src/lib
COPY src/data/places.ts ./src/data/places.ts
COPY tsconfig.server.json ./
ENV DATABASE_PATH=/data/ridesync.db
VOLUME /data
EXPOSE 8787
CMD ["node", "--import", "tsx", "server/prod.ts"]
