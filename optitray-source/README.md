# OptiTray

A small Windows 10/11 system-tray utility with quick calculators for optical engineers.
Left-click the tray icon (or press **Ctrl + Alt + O**) to open the popup. Right-click the icon for a menu
that jumps straight to a tool, pins the popup open, toggles *Start with Windows*, or quits.

## Tools

| # | Tool | What it does |
|---|------|--------------|
| 1 | **dB & power** | Gain triangle (solve gain, output or input power, mixed units mW / W / dBm / dBW), power unit converter, ratio ↔ dB (power or field). |
| 2 | **Wavelength ↔ frequency** | Single value → λ (vacuum and in a medium), ν, wavenumber, photon energy, ω, period. **Center + span** (span in nm, pm, GHz, THz or cm⁻¹) and **start / stop** range conversion in both domains. |
| 3 | **Fabry–Pérot** | Cavity → FSR (Hz and nm), finesse, coefficient of finesse, FWHM, Q, photon lifetime, peak transmission, mode number, Airy plot. Supports unequal mirrors, intracavity loss and tilt. Inverse: FSR + finesse (or FWHM) → cavity length and mirror reflectivity. |
| 4 | **Frequency mixing** | SFG, DFG, SHG, THG, 4HG, OPO idler (ωp − ωs), FWM (2ω1 − ω2 and 2ω2 − ω1), with any input unit. |
| 5 | **Photon & detector** | Photon energy, photon rate, responsivity ↔ QE, photocurrent, shot-noise density. |
| 6 | **Linewidth & coherence** | Δλ ↔ Δν ↔ Δk, Q, coherence time and length, transform-limited pulse width. |
| 7 | **Pulse train** | Pulse energy, peak power (sech², Gaussian, Lorentzian, square), duty cycle, photons per pulse, transform-limited bandwidth, peak fluence and intensity. |
| 8 | **Gaussian beam** | Rayleigh range, divergence, BPP, w(z), R(z), Gouy phase (with M² and index); lens focusing spot size. |
| 9 | **Fiber** | NA, acceptance angle, V-number, single-mode cutoff, MFD (Marcuse), group delay, dispersion broadening. |

Everything recalculates as you type. Inputs accept scientific notation (`1.2e-3`), and **↑ / ↓** nudges the last digit
(Shift for ×10). Click any result to copy it. Esc goes back to the tool list, or hides the popup from the list.
Inputs are remembered between sessions.

## Install

- `OptiTray-Setup-1.1.0.exe`: per-user installer (no admin rights). It adds a Start-menu entry and an entry under
  Settings → Apps for uninstalling, then launches into the tray.
- `OptiTray-1.1.0-portable.zip`: unzip anywhere and run `OptiTray-win32-x64\OptiTray.exe`. No install.

The builds are unsigned, so Windows SmartScreen may show "Windows protected your PC". Choose **More info → Run anyway**.
On Windows 11 the icon may land in the hidden-icons overflow (^). Drag it onto the taskbar to keep it visible.

## Network and security

- **Fully offline.** The app makes no network requests: no updates, telemetry, fonts or CDNs. Every request that is not a
  bundled local file is cancelled in `src/main.js`, pop-up windows and navigation are blocked, and all browser permissions
  except clipboard write are denied. The page also carries a strict Content-Security-Policy (`'self'` only).
- **No runtime npm packages.** The shipped app is the official Electron runtime plus the files in `src/`.
- **Minimal, pinned build dependencies.** Four exact-pinned dev dependencies (`electron`, `@electron/get`,
  `@electron-internal/extract-zip`, `resedit`), 15 packages in total, no install scripts, no deprecation warnings.
  electron-builder is not used.
- **Verified runtime.** The build downloads the Electron zip from the official GitHub release and checks its SHA-256
  against the checksums published inside the `electron` npm package before using it.
- **Renderer is sandboxed** (`sandbox`, `contextIsolation`, no Node integration). It only gets six IPC calls (hide, pin, menu, quit, and two listeners).
- `npm audit` (7 Nov 2026): 0 vulnerabilities.

## Develop

```bash
npm install
npx install-electron --no   # once: downloads the Electron runtime for `npm start`
npm start          # run from source
npm test           # unit tests for the calculation core (src/calc.js)
npm run dist       # build dist/OptiTray-win32-x64, the portable zip and (if NSIS is installed) the installer
npm run icons      # regenerate assets/ icons
```

The installer needs NSIS (`winget install NSIS.NSIS`). Without it, `npm run dist` still produces the portable build.
The build is `scripts/build.mjs` (about 120 lines) plus `scripts/installer.nsi`.

Layout:

- `src/calc.js`: pure calculation core (SI units, no dependencies), shared by tests and UI.
- `src/renderer/tools.js`: tool definitions (inputs per mode + compute → result rows). Add a tool here.
- `src/renderer/app.js`: popup UI (tool list, fields, results, copy, persistence).
- `src/main.js`: tray icon, popup positioning above the taskbar, context menu, hotkey.

## Conventions and assumptions

- Wavelengths are vacuum wavelengths unless labelled "in medium". c = 299 792 458 m/s, CODATA h and e.
- Spectral ranges: the span is applied symmetrically in the domain you enter it in, and the end points are converted exactly
  (not with the small-span approximation). Linewidth tool uses Δν = cΔλ/λ².
- Fabry–Pérot finesse is reflectivity-limited, 𝓕 = π√R/(1−R) with R = √(R1R2)·(1 − loss per pass). Inverse reflectivity assumes equal lossless mirrors.
- Mixing is energy conservation only (no phase matching).
- Gaussian beam: 1/e² radius, divergence θ = M²λ/(πw₀n). Focusing uses w₀ = M²λf/(πw_in).

## License

OptiTray is licensed under the GNU General Public License v3.0. See [LICENSE](../LICENSE) for the full text.
