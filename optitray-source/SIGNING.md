# Code signing (Windows SmartScreen)

`npm run dist` builds unsigned by default. When a signing certificate is configured through environment
variables, the build Authenticode-signs:

1. `OptiTray.exe` (before it is zipped or packed into the installer, so both downloads contain the signed exe),
2. the NSIS uninstaller, before it is embedded in the installer (needs NSIS 3.08 or newer),
3. `OptiTray-Setup-<version>.exe`.

Each file is signed with SHA-256, timestamped (so signatures stay valid after the certificate expires) and checked
with `signtool verify /pa`. Any failure stops the build.

## What signing does and does not fix

- Windows shows a **verified publisher name** instead of "Unknown publisher".
- SmartScreen's "Windows protected your PC" warning is driven by **reputation**. Reputation is tied to the
  signing certificate, so it builds up over downloads and carries over to new versions. An unsigned build starts
  from zero with every release.
- A brand-new certificate can still trigger the warning for the first releases, until enough people have run
  signed builds. EV certificates no longer skip this step.

## Requirements

- Windows, with `signtool.exe` from the Windows SDK (`winget install Microsoft.WindowsSDK.10.0.26100`). The build
  finds it on `PATH` or under `C:\Program Files (x86)\Windows Kits\10\bin`; set `OPTITRAY_SIGNTOOL` to override.
- A code-signing certificate. Since June 2023, publicly trusted code-signing keys must live on hardware (a USB token or
  a cloud HSM), so a downloadable `.pfx` is no longer available from public CAs. Options:
  - **Azure Artifact Signing** (formerly Trusted Signing): a Microsoft-run cloud service with a monthly fee. Check
    Microsoft's current eligibility rules for individuals and organisations.
  - **SignPath Foundation**: free signing for open-source projects, run from CI (for example GitHub Actions). OptiTray
    is GPL-3.0, so it may qualify.
  - **An OV certificate on a USB token** from a commercial CA. Some CAs offer cheaper certificates for open-source
    developers.

## Configure

Pick one source and set its variables in the shell that runs `npm run dist`.

**Certificate in the Windows store** (USB token or any installed cert):

```powershell
$env:OPTITRAY_SIGN_THUMBPRINT = "<SHA-1 thumbprint>"
npm run dist
```

Find the thumbprint with `Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert`.

**Azure Artifact Signing:**

```powershell
az login
$env:OPTITRAY_SIGN_DLIB = "C:\path\to\Azure.CodeSigning.Dlib.dll"   # x64 build of the dlib
$env:OPTITRAY_SIGN_METADATA = "C:\path\to\metadata.json"
npm run dist
```

`metadata.json`:

```json
{
  "Endpoint": "https://<region>.codesigning.azure.net",
  "CodeSigningAccountName": "<account>",
  "CertificateProfileName": "<profile>"
}
```

**`.pfx` file** (self-signed test certificates only; it does not help with SmartScreen):

```powershell
$env:OPTITRAY_SIGN_PFX = "C:\path\to\cert.pfx"
$env:OPTITRAY_SIGN_PASSWORD = "<password>"
$env:OPTITRAY_SIGN_SKIP_VERIFY = "1"   # a self-signed cert fails the trust check by design
npm run dist
```

Optional variables:

| Variable | Purpose |
|---|---|
| `OPTITRAY_REQUIRE_SIGNING=1` | Fail the build if no certificate is configured (use for release builds). |
| `OPTITRAY_SIGN_TIMESTAMP` | RFC 3161 timestamp URL. Default: DigiCert, or Microsoft's for Azure. |
| `OPTITRAY_SIGN_DESCRIPTION` | Description shown in Windows prompts. Default `OptiTray`. |
| `OPTITRAY_SIGNTOOL` | Full path to `signtool.exe`. |

You can also sign a single file by hand with `npm run sign -- <file>`.

## Check a build

```powershell
signtool verify /pa /v dist\OptiTray-Setup-1.1.0.exe
```

Or right-click the file → Properties → Digital Signatures.

Never commit certificates, `.pfx` files or passwords. In CI, keep them in the CI system's secret store.
`signtool` takes the `.pfx` password as a command-line argument, which other processes running as the same Windows
user can read while it signs. That is fine for test certificates; for real releases use the certificate store or Azure.
