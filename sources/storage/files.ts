import * as Minio from 'minio';
import { log } from '@/utils/log';

const s3Host = process.env.S3_HOST;
const s3Port = process.env.S3_PORT ? parseInt(process.env.S3_PORT, 10) : undefined;
const s3UseSSL = process.env.S3_USE_SSL ? process.env.S3_USE_SSL === 'true' : true;
const s3AccessKey = process.env.S3_ACCESS_KEY;
const s3SecretKey = process.env.S3_SECRET_KEY;
const s3BucketName = process.env.S3_BUCKET;
const s3PublicUrl = process.env.S3_PUBLIC_URL;

export let s3Enabled = false;

let s3clientInternal: Minio.Client | null = null;
let s3bucketInternal: string = '';
let s3hostInternal: string = '';
let s3publicInternal: string = '';

function initS3() {
    if (!s3Host || !s3AccessKey || !s3SecretKey || !s3BucketName) {
        log('S3 not configured, file uploads disabled');
        return;
    }
    try {
        s3clientInternal = new Minio.Client({
            endPoint: s3Host,
            port: s3Port,
            useSSL: s3UseSSL,
            accessKey: s3AccessKey,
            secretKey: s3SecretKey,
        });
        s3Enabled = true;
        s3bucketInternal = s3BucketName;
        s3hostInternal = s3Host;
        s3publicInternal = s3PublicUrl || `http://${s3Host}:${s3Port || 9000}/${s3BucketName}`;
    } catch (e) {
        s3Enabled = false;
        log('S3 initialization failed, file uploads disabled');
    }
}

initS3();

export { s3clientInternal as s3client, s3bucketInternal as s3bucket, s3hostInternal as s3host, s3publicInternal as s3public };

export async function loadFiles() {
    if (!s3Enabled) {
        log('S3 storage not available - continuing without file storage');
        return;
    }
    try {
        await s3client!.bucketExists(s3bucket);
    } catch (e) {
        log('S3 bucket not accessible, disabling file uploads');
        s3Enabled = false;
    }
}

export function getPublicUrl(path: string) {
    return `${s3public}/${path}`;
}

export type ImageRef = {
    width: number;
    height: number;
    thumbhash: string;
    path: string;
}
