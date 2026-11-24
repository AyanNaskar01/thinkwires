import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

/**
 * Dynamically generates ephemeral X.509 certificates and keys in OS temp directory
 * for TLS integration unit tests without storing private keys in Git.
 */
export const createEphemeralTlsFixtures = () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thinkwires-tls-test-'));

  const sanCnf = path.join(tmpDir, 'san.cnf');
  fs.writeFileSync(
    sanCnf,
    '[v3_req]\nbasicConstraints = CA:FALSE\nkeyUsage = nonRepudiation, digitalSignature, keyEncipherment\nsubjectAltName = @alt_names\n[alt_names]\nDNS.1 = localhost\nIP.1 = 127.0.0.1\n'
  );

  const wrongSanCnf = path.join(tmpDir, 'wrong_san.cnf');
  fs.writeFileSync(
    wrongSanCnf,
    '[v3_req]\nbasicConstraints = CA:FALSE\nkeyUsage = nonRepudiation, digitalSignature, keyEncipherment\nsubjectAltName = @alt_names\n[alt_names]\nDNS.1 = evil.corp.internal\n'
  );

  const run = (cmd) => execSync(cmd, { stdio: 'pipe' });

  // 1. Trusted CA
  const trustedCaKey = path.join(tmpDir, 'trusted_ca.key');
  const trustedCaCrt = path.join(tmpDir, 'trusted_ca.crt');
  run(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${trustedCaKey}" -out "${trustedCaCrt}" -days 1 -subj "/CN=Trusted Thinkwires DB CA"`);

  // 2. Server Valid (signed by Trusted CA with SAN)
  const serverValidKey = path.join(tmpDir, 'server_valid.key');
  const serverValidCsr = path.join(tmpDir, 'server_valid.csr');
  const serverValidCrt = path.join(tmpDir, 'server_valid.crt');
  run(`openssl req -newkey rsa:2048 -nodes -keyout "${serverValidKey}" -out "${serverValidCsr}" -subj "/CN=localhost"`);
  run(`openssl x509 -req -in "${serverValidCsr}" -CA "${trustedCaCrt}" -CAkey "${trustedCaKey}" -CAcreateserial -out "${serverValidCrt}" -days 1 -extfile "${sanCnf}" -extensions v3_req`);

  // 3. Untrusted CA & Server Untrusted
  const untrustedCaKey = path.join(tmpDir, 'untrusted_ca.key');
  const untrustedCaCrt = path.join(tmpDir, 'untrusted_ca.crt');
  run(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${untrustedCaKey}" -out "${untrustedCaCrt}" -days 1 -subj "/CN=Untrusted Rogue CA"`);

  const serverUntrustedKey = path.join(tmpDir, 'server_untrusted.key');
  const serverUntrustedCsr = path.join(tmpDir, 'server_untrusted.csr');
  const serverUntrustedCrt = path.join(tmpDir, 'server_untrusted.crt');
  run(`openssl req -newkey rsa:2048 -nodes -keyout "${serverUntrustedKey}" -out "${serverUntrustedCsr}" -subj "/CN=localhost"`);
  run(`openssl x509 -req -in "${serverUntrustedCsr}" -CA "${untrustedCaCrt}" -CAkey "${untrustedCaKey}" -CAcreateserial -out "${serverUntrustedCrt}" -days 1 -extfile "${sanCnf}" -extensions v3_req`);

  // 4. Server Wrong Host (signed by Trusted CA but SAN is evil.corp.internal)
  const serverWrongHostKey = path.join(tmpDir, 'server_wrong_host.key');
  const serverWrongHostCsr = path.join(tmpDir, 'server_wrong_host.csr');
  const serverWrongHostCrt = path.join(tmpDir, 'server_wrong_host.crt');
  run(`openssl req -newkey rsa:2048 -nodes -keyout "${serverWrongHostKey}" -out "${serverWrongHostCsr}" -subj "/CN=evil.corp.internal"`);
  run(`openssl x509 -req -in "${serverWrongHostCsr}" -CA "${trustedCaCrt}" -CAkey "${trustedCaKey}" -CAcreateserial -out "${serverWrongHostCrt}" -days 1 -extfile "${wrongSanCnf}" -extensions v3_req`);

  const fixtures = {
    dir: tmpDir,
    trustedCaPem: fs.readFileSync(trustedCaCrt, 'utf8'),
    trustedCaPath: trustedCaCrt,
    serverValidKey: fs.readFileSync(serverValidKey, 'utf8'),
    serverValidCert: fs.readFileSync(serverValidCrt, 'utf8'),
    serverUntrustedKey: fs.readFileSync(serverUntrustedKey, 'utf8'),
    serverUntrustedCert: fs.readFileSync(serverUntrustedCrt, 'utf8'),
    serverWrongHostKey: fs.readFileSync(serverWrongHostKey, 'utf8'),
    serverWrongHostCert: fs.readFileSync(serverWrongHostCrt, 'utf8'),
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };

  return fixtures;
};
