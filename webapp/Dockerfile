FROM python:3.11-slim

WORKDIR /app

COPY webapp/requirements.txt /app/webapp/requirements.txt

RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r /app/webapp/requirements.txt

COPY backend /app/backend
COPY webapp /app/webapp

ENV PYTHONUNBUFFERED=1

CMD ["sh", "-c", "uvicorn webapp.case_explorer.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
