FROM python:3.12-slim

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Python dependencies ───────────────────────────────────────────────────────
# Copy requirements first to leverage Docker layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ──────────────────────────────────────────────────────────
COPY . .

# ── Runtime ───────────────────────────────────────────────────────────────────
# Railway injects PORT as an environment variable.
# Uvicorn reads it from the CMD; we expose 8000 as the default.
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --log-level info"]
