# syntax=docker/dockerfile:1
# Image de l'API NextClinic (Express + Socket.io). Construite depuis le dossier server/.

# ── Dépendances de production, à partir du fichier de verrouillage ──
FROM node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── Image d'exécution ──
FROM node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
ENV NODE_ENV=production \
    PORT=3001 \
    TZ=Africa/Casablanca
WORKDIR /app

# Code en lecture seule pour l'utilisateur d'exécution (propriété de root)
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Seuls les dossiers de fichiers téléversés sont modifiables (le volume s'y monte)
RUN mkdir -p uploads/profiles uploads/logos uploads/examens uploads/cin-scans \
    && chown -R node:node uploads

USER node
EXPOSE 3001

# /api/health renvoie 503 si la base est injoignable
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3001/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "index.js"]
