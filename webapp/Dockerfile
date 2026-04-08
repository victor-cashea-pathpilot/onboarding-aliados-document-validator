FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

COPY webapp/requirements.txt /app/webapp/requirements.txt

RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel && \
    python -m pip install --no-cache-dir -r /app/webapp/requirements.txt

COPY backend /app/backend
COPY webapp /app/webapp

RUN addgroup --system app && adduser --system --ingroup app app && \
    chown -R app:app /app

USER app

EXPOSE 8080

CMD ["sh", "-c", "uvicorn webapp.case_explorer.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
