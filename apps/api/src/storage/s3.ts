import { createHash, createHmac } from 'node:crypto';

export interface S3Config {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

const sha256hex = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data).digest();
const encodePath = (key: string): string =>
  key.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

/** Client S3 minimal (SigV4, adressage par chemin) : suffisant pour MinIO et les stockages compatibles. */
export class S3Client {
  constructor(private readonly config: S3Config) {}

  async ensureBucket(): Promise<void> {
    const head = await this.request('HEAD', '');
    if (head.status === 200) return;
    const created = await this.request('PUT', '');
    if (created.status !== 200 && created.status !== 409) throw new Error(`S3 : création du bucket impossible (${created.status})`);
  }

  async put(key: string, body: Buffer, contentType = 'application/octet-stream'): Promise<void> {
    const res = await this.request('PUT', key, body, { 'content-type': contentType });
    if (res.status !== 200) throw new Error(`S3 : écriture refusée (${res.status})`);
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.request('GET', key);
    if (res.status === 404) return null;
    if (res.status !== 200) throw new Error(`S3 : lecture refusée (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const res = await this.request('DELETE', key);
    if (res.status !== 204 && res.status !== 200 && res.status !== 404) throw new Error(`S3 : suppression refusée (${res.status})`);
  }

  private request(method: string, key: string, body: Buffer = Buffer.alloc(0), extra: Record<string, string> = {}): Promise<Response> {
    const { endpoint, region, accessKey, secretKey, bucket } = this.config;
    const url = new URL(endpoint);
    const path = `/${bucket}${key ? `/${encodePath(key)}` : ''}`;
    const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = now.slice(0, 8);
    const payloadHash = sha256hex(body);
    const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': now, ...extra };
    const names = Object.keys(headers).sort();
    const canonical = [method, path, '', ...names.map((n) => `${n}:${headers[n]!.trim()}`), '', names.join(';'), payloadHash].join('\n');
    const scope = `${day}/${region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', now, scope, sha256hex(canonical)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
    headers['authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
    delete headers['host'];
    return fetch(`${url.origin}${path}`, { method, headers, body: method === 'PUT' && body.length > 0 ? new Uint8Array(body) : undefined });
  }
}
