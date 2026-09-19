#!/bin/sh
# Builds the container (Dockerfile) with Cloud Build and puts it on Cloud Run.
#
#   PROJECT=my-project ./deploy.sh
#
# One instance at most, to bound what it can spend: there is no login, and the
# process holds nothing a second one would miss. The keys come from Secret Manager, and made
# photographs are kept in a bucket mounted where PHOTOS_DIR says. The project
# needs, once: secrets GEMINI_API_KEY and JEV_API_KEY, a bucket $PROJECT-photos,
# and a service account jev2ui-run that can read the first and write the second.
set -e
: "${PROJECT:?say which project: PROJECT=... ./deploy.sh}"
REGION=${REGION:-us-central1}

gcloud run deploy jev2ui --project "$PROJECT" --region "$REGION" --source . \
  --service-account "jev2ui-run@$PROJECT.iam.gserviceaccount.com" \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,JEV_API_KEY=JEV_API_KEY:latest \
  --set-env-vars PHOTOS_DIR=/data/photos \
  --execution-environment gen2 \
  --add-volume "name=photos,type=cloud-storage,bucket=$PROJECT-photos,mount-options=uid=1000;gid=1000" \
  --add-volume-mount volume=photos,mount-path=/data/photos \
  --min-instances 0 --max-instances 1 --concurrency 40 --cpu 1 --memory 1Gi --timeout 900 \
  --allow-unauthenticated --quiet
