# ML Service Deployment

This service is independent from frontend and backend deployments.

## Option 1: Render (Recommended)

1. Push repository with `render.yaml` to GitHub.
2. In Render: New -> Blueprint.
3. Select this repository.
4. Render will create `devtrails-ml-service` from `ml-service/Dockerfile`.
5. Wait for deployment.
6. Verify health:
   - `GET /health`

Expected base URL example:
- `https://devtrails-ml-service.onrender.com`

Set backend environment variable:
- `ML_SERVICE_URL=https://devtrails-ml-service.onrender.com/predict`

Live deployment used for this project:
- `https://devtrails-ml-service.onrender.com`

## Option 2: Railway

1. Create a new Railway project from this repo.
2. Set root directory to `ml-service`.
3. Use Dockerfile build.
4. Expose port `5001`.
5. Deploy and verify `GET /health`.

## Local Smoke Test

```powershell
Invoke-RestMethod https://YOUR-ML-URL/health
Invoke-RestMethod -Method Post -Uri https://YOUR-ML-URL/predict -ContentType application/json -Body '{"temperature":33,"rainfall":80,"aqi":140,"past_claims":3,"location_risk":0.4}'
```
