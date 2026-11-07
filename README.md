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

- `OptiTray Setup 1.0.1.exe`: per-user installer (no admin rights), adds a Start-menu entry and launches into the tray.
- `OptiTray-1.0.1-portable.exe`: single exe, no install.

The builds are unsigned, so Windows SmartScreen may show "Windows protected your PC". Choose **More info → Run anyway**.
On Windows 11 the icon may land in the hidden-icons overflow (^). Drag it onto the taskbar to keep it visible.

## Network and security

- **Fully offline.** The app makes no network requests: no updates, telemetry, fonts or CDNs. Every request that is not a
  bundled local file is cancelled in `src/main.js`, pop-up windows and navigation are blocked, and all browser permissions
  except clipboard write are denied. The page also carries a strict Content-Security-Policy (`'self'` only).
- **No runtime npm packages.** The shipped app is Electron plus the files in `src/`. `electron` and `electron-builder` are
  build-time dev dependencies, pinned to exact versions.
- **Renderer is sandboxed** (`sandbox`, `contextIsolation`, no Node integration). It only gets six IPC calls (hide, pin, menu, quit, and two listeners).
- `npm audit` (Nov 2026): 0 vulnerabilities. electron-builder's tooling pulled in minimatch 9.x/10.x (GHSA-g3hv-75wg-m249, a DoS);
  an `overrides` entry in `package.json` forces every affected copy onto the patched minimatch 11.0.3.

## Develop

```bash
npm install
npx install-electron --no   # only if `npm start` says Electron failed to install
npm start          # run from source
npm test           # unit tests for the calculation core (src/calc.js)
npm run dist       # build installer + portable exe into dist/
npm run icons      # regenerate assets/ icons
```

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
