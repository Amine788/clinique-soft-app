# syntax=docker/dockerfile:1
# Image du front NextClinic : compilation Vite, puis service par Caddy (fichiers statiques + reverse proxy vers l'API).

# ── Compilation ──
FROM node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vide par défaut : le front appelle l'API à sa propre adresse (/api, /socket.io), relayée par Caddy
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Service ──
FROM caddy:2.11.7-alpine@sha256:e70b164da81ef698b3ad19af799ea6086ce6d9e48ed4079eb9fe26f6fbf14ee5
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
