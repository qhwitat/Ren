FROM ghcr.io/danny-avila/librechat:latest

ENV HOST=0.0.0.0
ENV PORT=7860

RUN mkdir -p /app/uploads/temp \
    && mkdir -p /app/client/public/images/temp \
    && mkdir -p /app/api/logs \
    && mkdir -p /app/data \
    && chmod -R 777 /app/uploads \
    && chmod -R 777 /app/client/public/images \
    && chmod -R 777 /app/api/logs \
    && chmod -R 777 /app/data

COPY librechat.yaml /app/librechat.yaml

EXPOSE 7860
