#!/bin/sh
# Builds the container (Dockerfile) with Cloud Build and puts it on Cloud Run.
#
#   PROJECT=my-project ./deploy.sh
#   PROJECT=my-project FIREBASE_API_KEY=AIza... ./deploy.sh    # behind Google sign-in
#
# With FIREBASE_API_KEY (the web API key of the project's Firebase app, which is
# not a secret), making things takes a Google sign-in and a line on the access
# list in Firestore (src/server/auth.ts). It is said once: a later deploy
# without it leaves sign-in as it was. A service never given it has no login.
# For that the project also needs: Google enabled as a sign-in provider and the
# service's domain authorized, in Firebase Authentication; a Firestore database;
# and roles/datastore.user for the service account.
#
# One instance at most, to bound what a busy day can spend: the process holds
# nothing a second one would miss. The keys come from Secret Manager, and made
# photographs are kept in a bucket mounted where PHOTOS_DIR says. The project
# needs, once: secrets GEMINI_API_KEY and JEV_API_KEY, a bucket $PROJECT-photos,
# and a service account jev2ui-run that can read the first and write the second.
set -e
: "${PROJECT:?say which project: PROJECT=... ./deploy.sh}"
REGION=${REGION:-us-central1}

gcloud run deploy jev2ui --project "$PROJECT" --region "$REGION" --source . \
  --service-account "jev2ui-run@$PROJECT.iam.gserviceaccount.com" \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest,JEV_API_KEY=JEV_API_KEY:latest \
  --update-env-vars "PHOTOS_DIR=/data/photos${FIREBASE_API_KEY:+,FIREBASE_PROJECT=$PROJECT,FIREBASE_API_KEY=$FIREBASE_API_KEY}${DAILY_RUNS:+,DAILY_RUNS=$DAILY_RUNS}" \
  --execution-environment gen2 \
  --add-volume "name=photos,type=cloud-storage,bucket=$PROJECT-photos,mount-options=uid=1000;gid=1000" \
  --add-volume-mount volume=photos,mount-path=/data/photos \
  --min-instances 0 --max-instances 1 --concurrency 40 --cpu 1 --cpu-boost --memory 1Gi --timeout 900 \
  --allow-unauthenticated --quiet
