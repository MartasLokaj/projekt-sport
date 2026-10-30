import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from 'selfsigned';

// Phones only allow motion sensors on HTTPS pages, so we need a certificate.
// We create a self-signed one on first run and reuse it. A new one is made
// when the Mac gets a different network address or the old one is about to expire.

const CERT_DIR = join(import.meta.dirname, '..', 'certs');
const KEY_FILE = join(CERT_DIR, 'key.pem');
const CERT_FILE = join(CERT_DIR, 'cert.pem');
const META_FILE = join(CERT_DIR, 'meta.json');

const VALID_DAYS = 365;
const RENEW_BEFORE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type CertMeta = { addresses: string[]; expires: string };

export async function ensureCertificate(lanAddresses: string[]): Promise<{ key: string; cert: string }> {
  const addresses = ['127.0.0.1', ...lanAddresses];

  if (existsSync(KEY_FILE) && existsSync(CERT_FILE) && existsSync(META_FILE)) {
    const meta = JSON.parse(readFileSync(META_FILE, 'utf8')) as CertMeta;
    const coversAll = addresses.every((a) => meta.addresses.includes(a));
    const fresh = new Date(meta.expires).getTime() - Date.now() > RENEW_BEFORE_DAYS * DAY_MS;
    if (coversAll && fresh) {
      return { key: readFileSync(KEY_FILE, 'utf8'), cert: readFileSync(CERT_FILE, 'utf8') };
    }
  }

  console.log('Creating a new HTTPS certificate for', addresses.join(', '));
  const expires = new Date(Date.now() + VALID_DAYS * DAY_MS);
  const pems = await generate([{ name: 'commonName', value: 'Minigolf Party (local)' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: expires,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, ...addresses.map((ip) => ({ type: 7 as const, ip }))],
      },
    ],
  });

  mkdirSync(CERT_DIR, { recursive: true });
  writeFileSync(KEY_FILE, pems.private, { mode: 0o600 });
  writeFileSync(CERT_FILE, pems.cert);
  writeFileSync(META_FILE, JSON.stringify({ addresses, expires: expires.toISOString() } satisfies CertMeta, null, 2));
  return { key: pems.private, cert: pems.cert };
}
