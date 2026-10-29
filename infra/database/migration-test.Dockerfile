FROM postgres:17-alpine
RUN apk add --no-cache python3 openssl util-linux \
    && mkdir -p /usr/lib/postgresql/17 /workspace/packages/db \
    && ln -s /usr/local/bin /usr/lib/postgresql/17/bin
