# syntax=docker/dockerfile:1.6
FROM python:3.12-slim

WORKDIR /app

# System deps — own layer so apt cache survives code-only changes
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Requirements first, isolated layer — only re-runs when requirements.txt
# changes. BuildKit pip cache mount makes rebuilds even faster.
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && \
    pip install -r requirements.txt

# App + migrations + entrypoint last — every code change invalidates only
# from here down. Everything above is cached across commits.
COPY ./app ./app
COPY ./alembic ./alembic
COPY ./alembic.ini ./alembic.ini
COPY ./entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["./entrypoint.sh"]
