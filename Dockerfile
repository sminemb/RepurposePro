ARG APP_TARGET
ARG RUNTIME_BASE=node:22.18.0-bookworm-slim

FROM node:22.18.0-bookworm-slim AS build

ARG APP_TARGET
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV CI="true"

RUN corepack enable && corepack prepare pnpm@11.10.0 --activate

WORKDIR /repo
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run build:packages \
  && pnpm --filter "@repurposepro/${APP_TARGET}" run build
RUN pnpm install --prod --filter "@repurposepro/${APP_TARGET}..." --frozen-lockfile

FROM ${RUNTIME_BASE} AS runtime

ARG APP_TARGET
ENV APP_TARGET="${APP_TARGET}"
ENV NODE_ENV="production"
ENV STORAGE_ROOT="/mnt/repurposepro-storage"
ENV FFMPEG_PATH="/usr/bin/ffmpeg"
ENV FFPROBE_PATH="/usr/bin/ffprobe"
ENV WHISPER_PYTHON_PATH="/opt/whisper-venv/bin/python"
ENV FACE_PYTHON_PATH="/opt/face-venv/bin/python"
ENV FACE_MODEL_PATH="/opt/models/blaze_face_short_range.tflite"

RUN apt-get update \
    && apt-get install --no-install-recommends -y ffmpeg \
    && if [ "${APP_TARGET}" = "worker" ]; then \
      apt-get install --no-install-recommends -y python3 python3-venv libglib2.0-0 libgl1 libgomp1; \
    fi \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build --chown=node:node /repo /app

RUN if [ "${APP_TARGET}" = "worker" ]; then \
      python3 -m venv /opt/whisper-venv \
      && /opt/whisper-venv/bin/pip install --no-cache-dir --disable-pip-version-check \
        -r /app/apps/worker/python/requirements-whisper.lock.txt \
      && python3 -m venv /opt/face-venv \
      && /opt/face-venv/bin/pip install --no-cache-dir --disable-pip-version-check \
        -r /app/apps/worker/python/requirements-framing.lock.txt \
      && mkdir -p /opt/models \
      && python3 /app/scripts/setup-framing.py --destination /opt/models/blaze_face_short_range.tflite \
      && chown -R node:node /opt/whisper-venv /opt/face-venv /opt/models; \
    fi

RUN if [ "${APP_TARGET}" = "worker" ]; then \
      mkdir -p /app/apps/worker/dist/python \
      && cp -R /app/apps/worker/python/. /app/apps/worker/dist/python/ \
      && chown -R node:node /app/apps/worker/dist/python; \
    fi

USER node
EXPOSE 4000
CMD ["sh", "-c", "exec node apps/${APP_TARGET}/dist/main.js"]
