// Authenticode signing for OptiTray builds, using signtool.exe from the Windows SDK.
//
// Signing is opt-in: if none of the variables below are set, isSigningConfigured() is false
// and the build stays unsigned. Pick ONE certificate source:
//
//   A. Certificate in the Windows store (also covers USB tokens / HSM-backed certs)
//        OPTITRAY_SIGN_THUMBPRINT   SHA-1 thumbprint of the cert (Certificates > Details > Thumbprint)
//
//   B. .pfx file (only for certs you are allowed to export, e.g. a self-signed test cert)
//        OPTITRAY_SIGN_PFX          path to the .pfx
//        OPTITRAY_SIGN_PASSWORD     its password (optional)
//
//   C. Azure Artifact Signing (formerly Trusted Signing)
//        OPTITRAY_SIGN_DLIB         path to Azure.CodeSigning.Dlib.dll (x64 build)
//        OPTITRAY_SIGN_METADATA     path to metadata.json (Endpoint, CodeSigningAccountName,
//                                   CertificateProfileName); sign in first with `az login`
//
// Optional:
//   OPTITRAY_SIGNTOOL           full path to signtool.exe (otherwise PATH, then Windows Kits is searched)
//   OPTITRAY_SIGN_TIMESTAMP     RFC 3161 timestamp URL (default depends on the source above)
//   OPTITRAY_SIGN_DESCRIPTION   text shown in the UAC prompt (default "OptiTray")
//   OPTITRAY_SIGN_SKIP_VERIFY   1 = skip `signtool verify /pa` (needed for self-signed test certs)
//
// CLI (used by the NSIS installer to sign the uninstaller it writes):
//   node scripts/sign.mjs <file> [<file> ...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const env = process.env;

export function signingMode() {
  if (env.OPTITRAY_SIGN_DLIB || env.OPTITRAY_SIGN_METADATA) return 'azure';
  if (env.OPTITRAY_SIGN_THUMBPRINT) return 'store';
  if (env.OPTITRAY_SIGN_PFX) return 'pfx';
  return null;
}

export const isSigningConfigured = () => signingMode() !== null;

function findSigntool() {
  if (env.OPTITRAY_SIGNTOOL) {
    if (!fs.existsSync(env.OPTITRAY_SIGNTOOL)) throw new Error(`OPTITRAY_SIGNTOOL not found: ${env.OPTITRAY_SIGNTOOL}`);
    return env.OPTITRAY_SIGNTOOL;
  }
  if (spawnSync('signtool', ['/?'], { stdio: 'ignore' }).status === 0) return 'signtool';
  // Windows SDK: C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64\signtool.exe, newest first.
  const kits = path.join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  if (fs.existsSync(kits)) {
    const versions = fs.readdirSync(kits).filter((d) => /^\d+\./.test(d))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) {
      const p = path.join(kits, v, 'x64', 'signtool.exe');
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('signtool.exe not found. Install the Windows SDK "Signing Tools" (winget install Microsoft.WindowsSDK.10.0.26100) or set OPTITRAY_SIGNTOOL.');
}

function signArgs(mode) {
  const args = ['sign', '/fd', 'SHA256', '/td', 'SHA256', '/d', env.OPTITRAY_SIGN_DESCRIPTION || 'OptiTray'];
  let timestamp = env.OPTITRAY_SIGN_TIMESTAMP;
  if (mode === 'azure') {
    if (!env.OPTITRAY_SIGN_DLIB || !env.OPTITRAY_SIGN_METADATA) {
      throw new Error('Azure signing needs both OPTITRAY_SIGN_DLIB and OPTITRAY_SIGN_METADATA.');
    }
    args.push('/dlib', env.OPTITRAY_SIGN_DLIB, '/dmdf', env.OPTITRAY_SIGN_METADATA);
    timestamp ||= 'http://timestamp.acs.microsoft.com';
  } else if (mode === 'store') {
    args.push('/sha1', env.OPTITRAY_SIGN_THUMBPRINT.replace(/\s/g, ''));
  } else {
    args.push('/f', env.OPTITRAY_SIGN_PFX);
    if (env.OPTITRAY_SIGN_PASSWORD) args.push('/p', env.OPTITRAY_SIGN_PASSWORD);
  }
  args.push('/tr', timestamp || 'http://timestamp.digicert.com');
  return args;
}

/** Signs each file in place and verifies the signature. Throws on any failure. */
export function sign(...files) {
  const mode = signingMode();
  if (!mode) throw new Error('No signing certificate configured (see scripts/sign.mjs).');
  if (process.platform !== 'win32') throw new Error('Signing uses signtool.exe and must run on Windows.');
  const signtool = findSigntool();
  const args = signArgs(mode);
  // execFileSync errors quote the full command line, which would include the .pfx password,
  // so failures are rethrown with a message that names only the step and file.
  const run = (step, a, file) => {
    try {
      execFileSync(signtool, a, { stdio: 'inherit' });
    } catch (e) {
      throw new Error(`signtool ${step} failed for ${path.basename(file)} (exit ${e.status ?? '?'}); see signtool output above`);
    }
  };
  for (const file of files) {
    run('sign', [...args, file], file);
    // Fails for untrusted (self-signed) certs, which is the point for releases.
    if (env.OPTITRAY_SIGN_SKIP_VERIFY !== '1') run('verify', ['verify', '/pa', '/q', file], file);
    console.log('• signed', path.basename(file), `(${mode})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('usage: node scripts/sign.mjs <file> [<file> ...]');
    process.exit(2);
  }
  try {
    sign(...files);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
