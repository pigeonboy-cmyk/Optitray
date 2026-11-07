// OptiTray Windows build, no electron-builder.
//
//   node scripts/build.mjs
//
// 1. Fetches the official Electron win32-x64 zip for the pinned Electron version and
//    verifies its SHA-256 against the checksums shipped inside the electron npm package.
// 2. Unpacks it to dist/OptiTray-win32-x64, renames electron.exe -> OptiTray.exe,
//    removes the default app, and copies src/ + assets/ into resources/app.
// 3. Writes the icon and version info into the exe with resedit (pure JS, no wine needed).
// 4. Authenticode-signs OptiTray.exe when a certificate is configured (see scripts/sign.mjs).
// 5. Zips the folder as the portable build, and runs makensis on scripts/installer.nsi when
//    NSIS is installed (winget install NSIS.NSIS / apt install nsis). When signing is on, the
//    installer and the uninstaller it writes are signed too.
//
// The only network access is step 1 (cached after the first build) and, when signing,
// the timestamp server (or Azure, for Artifact Signing).
//
// Set OPTITRAY_REQUIRE_SIGNING=1 (e.g. for release builds) to fail instead of building unsigned.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { downloadArtifact } from '@electron/get';
import { extract } from '@electron-internal/extract-zip';
import * as ResEdit from 'resedit';
import { sign, isSigningConfigured, signingMode } from './sign.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const electronPkgDir = path.dirname(require.resolve('electron/package.json'));
const ELECTRON_VERSION = JSON.parse(fs.readFileSync(path.join(electronPkgDir, 'package.json'), 'utf8')).version;
const CHECKSUMS = JSON.parse(fs.readFileSync(path.join(electronPkgDir, 'checksums.json'), 'utf8'));

const NAME = pkg.productName;
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, `${NAME}-win32-x64`);
const APP = path.join(OUT, 'resources', 'app');
const log = (...a) => console.log('•', ...a);

const SIGN = isSigningConfigured();
if (SIGN) log(`code signing on (${signingMode()})`);
else if (process.env.OPTITRAY_REQUIRE_SIGNING === '1') {
  throw new Error('OPTITRAY_REQUIRE_SIGNING=1 but no signing certificate is configured (see scripts/sign.mjs).');
} else log('code signing off: build will be unsigned (see scripts/sign.mjs to enable)');

// ---------------------------------------------------------------- 1. Electron runtime
const zipName = `electron-v${ELECTRON_VERSION}-win32-x64.zip`;
const expected = CHECKSUMS[zipName];
if (!expected) throw new Error(`no checksum for ${zipName} in electron/checksums.json`);
log(`Electron ${ELECTRON_VERSION} (win32-x64)`);
const zipPath = await downloadArtifact({
  version: ELECTRON_VERSION, platform: 'win32', arch: 'x64', artifactName: 'electron',
  checksums: CHECKSUMS,
});
const actual = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
if (actual !== expected) throw new Error(`checksum mismatch for ${zipName}: ${actual} != ${expected}`);
log('checksum ok', actual.slice(0, 16) + '…');

// ---------------------------------------------------------------- 2. app folder
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
await extract(zipPath, { dir: OUT });
fs.renameSync(path.join(OUT, 'electron.exe'), path.join(OUT, `${NAME}.exe`));
fs.rmSync(path.join(OUT, 'resources', 'default_app.asar'), { force: true });

fs.mkdirSync(APP, { recursive: true });
for (const dir of ['src', 'assets']) fs.cpSync(path.join(ROOT, dir), path.join(APP, dir), { recursive: true });
const appPkg = { name: pkg.name, productName: NAME, version: pkg.version, description: pkg.description, main: pkg.main, license: pkg.license };
fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify(appPkg, null, 2));
log('app files copied to', path.relative(ROOT, APP));

// ---------------------------------------------------------------- 3. icon + version info
{
  const exePath = path.join(OUT, `${NAME}.exe`);
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(ROOT, 'assets', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));

  const [maj, min, pat] = pkg.version.split('.').map(Number);
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0] || ResEdit.Resource.VersionInfo.createEmpty();
  vi.setFileVersion(maj, min, pat, 0, 1033);
  vi.setProductVersion(maj, min, pat, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    ProductName: NAME, FileDescription: NAME, CompanyName: NAME, InternalName: NAME,
    OriginalFilename: `${NAME}.exe`, LegalCopyright: pkg.license + ' license',
    FileVersion: pkg.version, ProductVersion: pkg.version,
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  log('icon and version info written to', `${NAME}.exe`);
}

// ---------------------------------------------------------------- 3b. Electron fuses
// Turns off Electron features an attacker could use to run their own code through our
// (signed) exe: ELECTRON_RUN_AS_NODE, NODE_OPTIONS and --inspect. Turns cookie encryption on.
// Written by hand (the fuse wire is a sentinel + version + length + one '0'/'1' byte per fuse)
// so no extra npm dependency is needed. Indexes follow @electron/fuses FuseV1Options.
{
  const exePath = path.join(OUT, `${NAME}.exe`);
  const buf = fs.readFileSync(exePath);
  const SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  const at = buf.indexOf(SENTINEL);
  if (at < 0 || buf.indexOf(SENTINEL, at + 1) >= 0) throw new Error('Electron fuse wire not found exactly once');
  const p = at + SENTINEL.length;
  if (buf[p] !== 1) throw new Error(`unsupported fuse wire version ${buf[p]}`);
  const len = buf[p + 1];
  const FUSES = { 0: false /* RunAsNode */, 1: true /* EnableCookieEncryption */,
    2: false /* EnableNodeOptionsEnvironmentVariable */, 3: false /* EnableNodeCliInspectArguments */ };
  for (const [i, on] of Object.entries(FUSES)) {
    if (+i >= len) throw new Error(`fuse ${i} missing from wire (length ${len})`);
    const c = buf[p + 2 + +i];
    if (c !== 0x30 && c !== 0x31) throw new Error(`fuse ${i} has unexpected value ${c}`);
    buf[p + 2 + +i] = on ? 0x31 : 0x30;
  }
  fs.writeFileSync(exePath, buf);
  log('fuses set:', buf.subarray(p + 2, p + 2 + len).toString('latin1'));
}

// ---------------------------------------------------------------- 4. code signing
// Must run after resedit (rewriting resources would invalidate a signature) and before
// packaging, so both the portable zip and the installer contain the signed exe.
if (SIGN) sign(path.join(OUT, `${NAME}.exe`));

// ---------------------------------------------------------------- 5. portable zip + installer
const has = (cmd, args = ['--version']) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const portableZip = path.join(DIST, `${NAME}-${pkg.version}-portable.zip`);
fs.rmSync(portableZip, { force: true });
if (process.platform === 'win32') {
  // bsdtar ships with Windows 10 1803+ and writes zip with -a
  execFileSync('tar', ['-a', '-c', '-f', portableZip, path.basename(OUT)], { cwd: DIST });
} else if (has('zip', ['-v'])) {
  execFileSync('zip', ['-qr', '-9', portableZip, path.basename(OUT)], { cwd: DIST });
}
if (fs.existsSync(portableZip)) log('portable:', path.relative(ROOT, portableZip));

const makensis = process.platform === 'win32'
  ? ['makensis', 'C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe'].find((c) => has(c, ['/VERSION']))
  : (has('makensis', ['-VERSION']) ? 'makensis' : null);
if (makensis) {
  const flag = process.platform === 'win32' ? '/' : '-';
  const setupExe = path.join(DIST, `${NAME}-Setup-${pkg.version}.exe`);
  execFileSync(makensis, [
    `${flag}V2`,
    `${flag}DAPP_NAME=${NAME}`, `${flag}DAPP_VERSION=${pkg.version}`,
    `${flag}DSRC_DIR=${OUT}`, `${flag}DOUT_FILE=${setupExe}`,
    `${flag}DICON=${path.join(ROOT, 'assets', 'icon.ico')}`,
    // makensis calls this back to sign the uninstaller before embedding it (NSIS 3.08+).
    ...(SIGN ? [`${flag}DSIGN_NODE=${process.execPath}`, `${flag}DSIGN_SCRIPT=${path.join(ROOT, 'scripts', 'sign.mjs')}`] : []),
    path.join(ROOT, 'scripts', 'installer.nsi'),
  ], { stdio: 'inherit' });
  if (SIGN) sign(setupExe);
  log('installer:', path.relative(ROOT, setupExe));
} else {
  log('NSIS not found, skipping installer (install NSIS to build it). The portable build is complete.');
}
