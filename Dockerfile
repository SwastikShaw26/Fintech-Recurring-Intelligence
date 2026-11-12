FROM node:26-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_URL=/ VITE_FINSIGHT_DEMO=true
RUN npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    FINSIGHT_DEPLOYMENT_MODE=demo CORS_ALLOWED_ORIGINS=none \
    FINSIGHT_FRONTEND_DIST=/app/frontend/dist
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/*.py src/
COPY config/merchant_aliases.json config/
COPY data/raw/synthetic_transactions.csv data/raw/ground_truth_labels.csv \
     data/raw/adversarial_benchmark_v1.json data/raw/merchant_holdout_v1.json data/raw/
RUN python -m src.detect_recurring_v3
COPY --from=frontend /build/dist frontend/dist/

USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD ["python", "-c", "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/api/ready', timeout=2).close()"]
CMD ["python", "-m", "uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers", "--no-access-log"]
