# T-0035 : pièces jointes

- Client S3 minimal SigV4 (`storage/s3.ts`), migration 021 `attachment` (RLS), `AttachmentService`, `AttachmentController` (POST octet-stream + ?name=, GET liste/téléchargement, DELETE).
- Sécurité : nom assaini, 25 Mo max, empreinte SHA-256 revérifiée à la lecture, téléchargement forcé (nosniff, CSP sandbox), clé de stockage opaque, audit + outbox.
- Config : S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, S3_REGION.
- Reste : UI d envoi dans ArtifactPage, quotas par organisation, antivirus.
