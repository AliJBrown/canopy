const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const internalEndpoint = `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`;

function makeClient(endpoint) {
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    },
    forcePathStyle: true,
  });
}

// Talks to MinIO over the internal network
const client = makeClient(internalEndpoint);
// Signs URLs for the browser; the host is part of the signature, so it must be the public one
const publicClient = makeClient((process.env.MINIO_PUBLIC_URL || internalEndpoint).replace(/\/+$/, ''));

const BUCKET = process.env.MINIO_BUCKET || 'canopy-attachments';

async function upload(key, buffer, contentType) {
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

async function deleteObject(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Pass downloadName to make the browser save the file instead of displaying it
async function presignedUrl(key, { expiresIn = 3600, downloadName } = {}) {
  const params = { Bucket: BUCKET, Key: key };
  if (downloadName) {
    const ascii = downloadName.replace(/[^\x20-\x7e]|["\\]/g, '_');
    params.ResponseContentDisposition =
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
  }
  return getSignedUrl(publicClient, new GetObjectCommand(params), { expiresIn });
}

module.exports = { upload, deleteObject, presignedUrl, BUCKET };
