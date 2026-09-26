FROM python:3.13-alpine
RUN pip install --no-cache-dir docker==7.1.0 requests==2.32.5
COPY collector.py /app/collector.py
CMD ["python", "-u", "/app/collector.py"]
