# ── Étape 1 : Build du frontend React/Vite ────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# ── Étape 2 : Backend Python + fichiers statiques ─────────────────────────────
FROM python:3.12-slim
WORKDIR /app/backend

# Dépendances système nécessaires pour pikepdf
RUN apt-get update && apt-get install -y --no-install-recommends \
    libqpdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Dépendances Python
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code backend
COPY backend/ .

# Copie du frontend buildé dans backend/dist (servi par FastAPI)
COPY --from=frontend-build /app/frontend/dist ./dist

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
