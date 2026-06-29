const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const client = new S3Client({
  endpoint: `http${process.env.MINIO_USE_SSL === 'true' ? 's' : ''}://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true,
});

const BUCKET = process.env.MINIO_BUCKET || 'canopy-attachments';

async function upload(key, buffer, contentType) {
  await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

async function deleteObject(key) {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

async function presignedUrl(key, expiresIn = 3600) {
  return getSignedUrl(client, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

module.exports = { upload, deleteObject, presignedUrl, BUCKET };
