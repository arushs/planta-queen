# Build stage: compile server and client TypeScript
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.client.json ./
COPY src ./src
COPY public ./public
RUN npm run build

# Runtime stage
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
EXPOSE 3000
# data/ and uploads/ are created at runtime — mount a volume at /app/data
# and /app/uploads to persist plants and photos across restarts.
CMD ["node", "dist/server/index.js"]
