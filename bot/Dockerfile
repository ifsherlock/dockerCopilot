FROM python:3.11-alpine
WORKDIR /app/bot
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
CMD ["python", "-m", "src.main"]
