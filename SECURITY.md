# Security policy

## Supported versions

Only the latest release of OptiTray receives security fixes. Please update before reporting.

| Version | Supported |
|---|---|
| latest release | yes |
| older releases | no |

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: go to the repository's **Security** tab and choose **Report a vulnerability**
([direct link](https://github.com/pigeonboy-cmyk/Optitray/security/advisories/new)). Only the maintainer can see the report.

Please include:

- the OptiTray version and Windows version,
- what an attacker could do, and what they would need (local access, a crafted file, etc.),
- steps to reproduce, or a proof of concept.

You can expect an acknowledgement within 7 days. Once a fix is released, the advisory is published and you are
credited unless you ask not to be.

## Scope

In scope: the OptiTray app (`optitray-source/src`), its installer and uninstaller, and the build and signing scripts
(`optitray-source/scripts`).

Out of scope: vulnerabilities in Electron or Chromium themselves (report those to the
[Electron project](https://github.com/electron/electron/security/policy)); the fix on our side is a version bump.

## Security design

OptiTray is a fully offline calculator. The design notes, covering network blocking, the sandboxed renderer, IPC checks,
Electron fuses and the build's supply-chain checks, are in the
[README](README.md#network-and-security).
