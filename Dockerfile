FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/opt/insightface

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --home-dir /opt/app --shell /usr/sbin/nologin appuser \
    && mkdir -p /opt/insightface /opt/app

WORKDIR /opt/app

COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

# Prepare buffalo_l during image build so runtime startup does not depend on a
# developer workstation cache or repeatedly download model weights.
RUN python -c "from insightface.app import FaceAnalysis; model = FaceAnalysis(name='buffalo_l'); model.prepare(ctx_id=-1, det_size=(640, 640))"

COPY app ./app

RUN chown -R appuser:appuser /opt/app /opt/insightface
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health', timeout=3)" \
    || exit 1

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
