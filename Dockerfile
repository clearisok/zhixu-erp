# This image is already available on the target machine and includes BusyBox.
FROM postgres:16-alpine

WORKDIR /app
COPY dist/client ./site/
COPY docker-serve.sh ./serve.sh
COPY docker-entrypoint-app.sh ./entrypoint.sh
COPY database ./database/
RUN chmod +x /app/serve.sh /app/entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=8s --start-period=8s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"ok": true' || exit 1

ENTRYPOINT []
CMD ["/app/entrypoint.sh"]
