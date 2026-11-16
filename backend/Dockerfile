FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY scripts ./scripts
COPY seed ./seed
EXPOSE 8000
CMD ["sh", "-c", "python -m scripts.init_db && python -m scripts.import_csv --directory /srv/seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
