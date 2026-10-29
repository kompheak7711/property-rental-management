# syntax=docker/dockerfile:1
# The installed V1 app's screens: the frontend built from frontend/package-lock.json, served by
# Caddy over HTTPS with its own local certificate authority (install/Caddyfile).
FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2.10
COPY install/Caddyfile /etc/caddy/Caddyfile
RUN sed -i 's/\r$//' /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
EXPOSE 8443
