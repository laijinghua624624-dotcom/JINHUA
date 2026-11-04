FROM node:20-bookworm-slim

# 中文 OCR 依赖 tesseract（服务启动时会优先用它做票据识别）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates tesseract-ocr tesseract-ocr-chi-sim \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.js config.json ./
COPY public ./public

RUN mkdir -p /app/data/photos && chown -R node:node /app
USER node

ENV PORT=8137 \
    NODE_ENV=production

EXPOSE 8137
CMD ["node", "server.js"]
