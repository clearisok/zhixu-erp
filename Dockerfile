FROM docker.m.daocloud.io/library/node:22-alpine AS builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts --no-audit --no-fund
COPY . .

ARG ZHIXU_BUILD_ID
ARG ZHIXU_GIT_COMMIT
ARG ZHIXU_BUILD_TIME
ENV ZHIXU_BUILD_ENV=production \
    ZHIXU_BUILD_ID=${ZHIXU_BUILD_ID} \
    ZHIXU_GIT_COMMIT=${ZHIXU_GIT_COMMIT} \
    ZHIXU_BUILD_TIME=${ZHIXU_BUILD_TIME}
RUN npm run build

FROM postgres:16-alpine

ARG ZHIXU_BUILD_ID
ARG ZHIXU_GIT_COMMIT
ARG ZHIXU_BUILD_TIME
ENV ZHIXU_BUILD_ENV=production \
    ZHIXU_BUILD_ID=${ZHIXU_BUILD_ID} \
    ZHIXU_GIT_COMMIT=${ZHIXU_GIT_COMMIT} \
    ZHIXU_BUILD_TIME=${ZHIXU_BUILD_TIME}
LABEL io.zhixu.build-id=${ZHIXU_BUILD_ID} \
      org.opencontainers.image.revision=${ZHIXU_GIT_COMMIT} \
      org.opencontainers.image.created=${ZHIXU_BUILD_TIME}

WORKDIR /app
COPY --from=builder /build/dist/client ./site/
COPY docker-serve.sh ./serve.sh
COPY docker-entrypoint-app.sh ./entrypoint.sh
COPY database ./database/
RUN chmod +x /app/serve.sh /app/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=8s --start-period=8s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"ok": true' || exit 1

ENTRYPOINT []
CMD ["/app/entrypoint.sh"]
