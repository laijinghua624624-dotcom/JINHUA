FROM caddy:2.11-alpine AS caddy

FROM python:3.13-slim-bookworm
ARG DEBIAN_MIRROR=https://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=https://deb.debian.org/debian-security
RUN sed -i \
        -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
        -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
        /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=5 -o Acquire::ForceIPv4=true update \
    && apt-get -o Acquire::Retries=5 -o Acquire::ForceIPv4=true install -y --no-install-recommends \
        ca-certificates curl ffmpeg fonts-wqy-zenhei libcap2-bin poppler-utils tesseract-ocr tesseract-ocr-chi-sim \
    && rm -rf /var/lib/apt/lists/*
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
RUN setcap -r /usr/bin/caddy
RUN useradd --create-home --uid 10001 studio \
    && mkdir -p /app /data /tmp/caddy-config /tmp/caddy-data \
    && chown -R studio:studio /app /data /tmp/caddy-config /tmp/caddy-data
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY index.html studio*.js studio*.css studio_server.py studio_pdf.py ./
COPY vendor/presentation.js ./vendor/presentation.js
COPY api-guide.html tutorial.html lance_qrcode_public.png lance_qrcode.png lance_intro.mp4 ./
COPY mobile.html mobile.js mobile.css mobile-config.js mobile-icon.svg mobile-sw.js mobile.webmanifest ./
COPY deliverables/*.pptx ./deliverables/
COPY deployment/Caddyfile.render /etc/caddy/Caddyfile
COPY deployment/start-render.sh /usr/local/bin/start-render
RUN chmod 755 /usr/local/bin/start-render
ENV PYTHONUNBUFFERED=1 \
    LANCE_DATA_DIR=/data \
    LANCE_BIND_HOST=127.0.0.1 \
    LANCE_TRUSTED_PROXY=1 \
    LANCE_PORT=8000 \
    XDG_CONFIG_HOME=/tmp/caddy-config \
    XDG_DATA_HOME=/tmp/caddy-data
CMD ["/usr/local/bin/start-render"]
