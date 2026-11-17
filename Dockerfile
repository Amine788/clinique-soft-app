# syntax=docker/dockerfile:1
# Image du front NextClinic : compilation Vite, puis service par Caddy (fichiers statiques + reverse proxy vers l'API).

# ── Compilation ──
FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vide par défaut : le front appelle l'API à sa propre adresse (/api, /socket.io), relayée par Caddy
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Service ──
FROM caddy:2.11.7-alpine
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
