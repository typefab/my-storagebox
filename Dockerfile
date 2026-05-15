# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json .
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Backend + built frontend
FROM node:20-alpine
WORKDIR /app

# Install sharp dependencies
RUN apk add --no-cache vips-dev python3 make g++

COPY backend/package.json .
RUN npm install --production

COPY backend/ .
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server.js"]
