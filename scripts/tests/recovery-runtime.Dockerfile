ARG BASE_IMAGE=zhixu-source-operator:ecef17ab-cdd7817300
FROM ${BASE_IMAGE}
USER root
RUN apk add --no-cache docker-cli
WORKDIR /tools/source
COPY . /tools/source/
RUN cp server/ainuoke-source/cli.ts server/ainuoke-source/recovery-real-cli.ts \
 && cp server/integration/fixtures/recovery-cli.ts server/ainuoke-source/cli.ts \
 && chmod 600 server/integration/fixtures/recovery-backup.py
ARG SOURCE_SHA
LABEL org.opencontainers.image.revision=${SOURCE_SHA}
ENTRYPOINT ["python3"]
