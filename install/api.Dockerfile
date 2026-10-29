# syntax=docker/dockerfile:1
# The installed V1 app's API image (install/compose.yaml): the backend from backend/uv.lock,
# the migrations, the password blocklist, the protected-key helper and the small start scripts.
FROM python:3.11-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never

RUN python -m pip install "uv==0.11.32"
WORKDIR /build
COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/src ./src
# Exactly the locked versions; the project itself is installed as a normal package.
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.11-slim AS runtime

ARG APP_BUILD_VERSION=v1-installed
ENV APP_BUILD_VERSION=${APP_BUILD_VERSION} \
    PATH=/opt/venv/bin:${PATH} \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --create-home --home-dir /home/app app

COPY --from=builder /opt/venv /opt/venv
WORKDIR /home/app
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY config/password-blocklist.txt /opt/prm/password-blocklist.txt
COPY scripts/local/with-protected-key.py /opt/prm/with-protected-key.py
COPY install/container/ /opt/prm/
# A copy made on Windows may have Windows line ends; the scripts need Unix ones.
RUN sed -i 's/\r$//' /opt/prm/*.sh /opt/prm/*.py \
    && chmod 0755 /opt/prm \
    && chmod 0644 /opt/prm/* \
    && mkdir -p /run/prm-secrets /run/prm-key /run/prm-db-passwords \
    && chmod 0755 /run/prm-secrets /run/prm-db-passwords \
    && chmod 0700 /run/prm-key

USER 10001:10001
EXPOSE 8000
