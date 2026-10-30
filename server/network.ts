import { networkInterfaces } from 'node:os';

/** IPv4 addresses of this Mac on the local network, Wi-Fi (en0) first. */
export function getLanAddresses(): string[] {
  const found: { name: string; address: string }[] = [];
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push({ name, address: entry.address });
    }
  }
  found.sort((a, b) => Number(b.name === 'en0') - Number(a.name === 'en0'));
  return found.map((f) => f.address);
}
