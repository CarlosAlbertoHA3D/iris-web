# VR Synchronization Feature

This feature allows users to synchronize their studies with a VR device (like Meta Quest 3) using a 5-digit code.

## Workflow

1.  **Generate Code**:
    *   User goes to "My Studies" on the web dashboard.
    *   Clicks "Synchronize with VR".
    *   A 5-digit code is generated (valid for 24 hours).

2.  **VR Login**:
    *   **Web**: Open `/vr-login` in the VR browser, enter the code.
    *   **APK**: The APK can use the API below to fetch studies using the code.

3.  **View Studies**:
    *   **Web**: After entering the code, the user sees a dashboard of studies. Clicking "View Study" opens the viewer in VR mode (WebXR compatible).
    *   **APK**: The APK receives a list of studies with direct S3 download URLs (presigned).

## API for APK Developers

### Get Studies by Code

*   **Endpoint**: `GET https://<API_ID>.execute-api.<REGION>.amazonaws.com/Prod/vr/studies`
*   **Query Parameter**: `code` (The 5-digit code)
*   **Response**:

```json
{
  "studies": [
    {
      "jobId": "uuid...",
      "filename": "study.nii.gz",
      "status": "completed",
      "createdAt": 1700000000,
      "downloadUrl": "https://s3... (Presigned URL for input file)",
      "artifacts": {
        "segmentation": "https://s3... (Presigned URL for segmentation)",
        "model": "https://s3... (Presigned URL for 3D model .glb/.obj)"
      }
    }
  ],
  "user_id": "uuid..."
}
```

*   **Error Codes**:
    *   `400`: Code is required.
    *   `401`: Invalid or expired code.

## Deployment

The backend uses AWS Lambda and DynamoDB.
*   Table: `iris-oculus-vr-codes` (TTL enabled on `expiresAt`)
*   Lambdas: `iris-vr-generate-code`, `iris-vr-get-studies`
