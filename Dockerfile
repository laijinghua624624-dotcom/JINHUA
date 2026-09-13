FROM python:3.13-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg poppler-utils ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --uid 10001 studio && mkdir -p /data && chown studio:studio /data
WORKDIR /app
COPY index.html studio*.js studio*.css studio_server.py ./
COPY vendor/presentation.js ./vendor/presentation.js
COPY legacy.html api-guide.html tutorial.html lance_qrcode_public.png lance_qrcode.png lance_intro.mp4 ./
ENV PYTHONUNBUFFERED=1 LANCE_DATA_DIR=/data LANCE_BIND_HOST=0.0.0.0 LANCE_BEHIND_AUTH_PROXY=1
USER studio
CMD ["python", "studio_server.py"]
