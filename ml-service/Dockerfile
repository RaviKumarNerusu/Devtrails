FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Train model during image build so runtime only needs to serve predictions.
RUN python train_model.py

EXPOSE 5001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001"]
