/*
 * OptiTray calculation core.
 * Pure functions, SI units in and out (m, Hz, W, s, J) unless a name says otherwise.
 * Loadable from Node (tests) and directly in the renderer as window.Calc.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C = 299792458;            // m/s
  const H = 6.62607015e-34;       // J s
  const QE = 1.602176634e-19;     // C
  const PI = Math.PI;

  // ---------------------------------------------------------------- units
  const UNITS = {
    length: { pm: 1e-12, nm: 1e-9, 'µm': 1e-6, mm: 1e-3, cm: 1e-2, m: 1, km: 1e3 },
    freq: { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9, THz: 1e12 },
    time: { fs: 1e-15, ps: 1e-12, ns: 1e-9, 'µs': 1e-6, ms: 1e-3, s: 1 },
    power: { pW: 1e-12, nW: 1e-9, 'µW': 1e-6, mW: 1e-3, W: 1, kW: 1e3 },
    energy: { fJ: 1e-15, pJ: 1e-12, nJ: 1e-9, 'µJ': 1e-6, mJ: 1e-3, J: 1 },
  };

  // Spectral quantities share one selector: wavelength, frequency, wavenumber, photon energy.
  const SPECTRAL = {
    nm: { kind: 'wl', k: 1e-9 }, 'µm': { kind: 'wl', k: 1e-6 }, pm: { kind: 'wl', k: 1e-12 },
    THz: { kind: 'f', k: 1e12 }, GHz: { kind: 'f', k: 1e9 },
    'cm⁻¹': { kind: 'wn', k: 1 }, eV: { kind: 'ev', k: 1 },
  };

  function toSI(value, group, unit) {
    const g = UNITS[group];
    if (!g || !(unit in g)) throw new Error(`unknown unit ${unit} in ${group}`);
    return value * g[unit];
  }
  function fromSI(value, group, unit) { return value / UNITS[group][unit]; }

  /** Any spectral value -> frequency in Hz (vacuum). */
  function spectralToHz(value, unit) {
    const u = SPECTRAL[unit];
    if (!u) throw new Error(`unknown spectral unit ${unit}`);
    switch (u.kind) {
      case 'wl': return C / (value * u.k);
      case 'f': return value * u.k;
      case 'wn': return value * 100 * C;
      case 'ev': return value * QE / H;
    }
  }
  /** Frequency in Hz -> value in a spectral unit. */
  function hzToSpectral(f, unit) {
    const u = SPECTRAL[unit];
    switch (u.kind) {
      case 'wl': return C / f / u.k;
      case 'f': return f / u.k;
      case 'wn': return f / C / 100;
      case 'ev': return f * H / QE;
    }
  }
  const isWavelengthUnit = (unit) => SPECTRAL[unit] && SPECTRAL[unit].kind === 'wl';

  // ---------------------------------------------------------------- dB / power
  const ratioToDb = (r) => 10 * Math.log10(r);
  const dbToRatio = (db) => Math.pow(10, db / 10);
  const ampRatioToDb = (r) => 20 * Math.log10(r);
  const dbToAmpRatio = (db) => Math.pow(10, db / 20);
  const wToDbm = (w) => 10 * Math.log10(w / 1e-3);
  const dbmToW = (dbm) => 1e-3 * Math.pow(10, dbm / 10);

  /** Power in W from a value in any power unit including dBm / dBW. */
  function powerToW(value, unit) {
    if (unit === 'dBm') return dbmToW(value);
    if (unit === 'dBW') return Math.pow(10, value / 10);
    return toSI(value, 'power', unit);
  }
  function wToPower(w, unit) {
    if (unit === 'dBm') return wToDbm(w);
    if (unit === 'dBW') return 10 * Math.log10(w);
    return fromSI(w, 'power', unit);
  }

  /**
   * Solve the dB gain triangle. Give two of pinW, poutW, gainDb (others null).
   * Returns { pinW, poutW, gainDb, ratio }.
   */
  function gainSolve({ pinW = null, poutW = null, gainDb = null }) {
    if (pinW != null && poutW != null) gainDb = ratioToDb(poutW / pinW);
    else if (pinW != null && gainDb != null) poutW = pinW * dbToRatio(gainDb);
    else if (poutW != null && gainDb != null) pinW = poutW / dbToRatio(gainDb);
    else throw new Error('need two of pin, pout, gain');
    return { pinW, poutW, gainDb, ratio: poutW / pinW };
  }

  // ---------------------------------------------------------------- wavelength / frequency
  /** Full description of a spectral point. n = refractive index of the medium. */
  function spectralPoint(fHz, n = 1) {
    const wl = C / fHz;
    return {
      fHz,
      wlVac: wl,
      wlMedium: wl / n,
      wavenumberCm: 1 / (wl * 100),
      photonJ: H * fHz,
      photonEv: H * fHz / QE,
      omega: 2 * PI * fHz,
      period: 1 / fHz,
    };
  }

  /**
   * Spectral range from center + full span, each in any spectral unit.
   * The span is applied symmetrically in its own domain (wavelength span is
   * symmetric in wavelength, frequency span symmetric in frequency), then the
   * end points are converted exactly to the other domain.
   */
  function rangeFromCenterSpan(centerValue, centerUnit, spanValue, spanUnit) {
    const fc = spectralToHz(centerValue, centerUnit);
    const sk = SPECTRAL[spanUnit];
    if (!sk) throw new Error(`unknown span unit ${spanUnit}`);
    let fLo, fHi;
    if (sk.kind === 'wl') {
      const wlc = C / fc, dwl = spanValue * sk.k;
      if (dwl / 2 >= wlc) throw new Error('span exceeds 2x center wavelength');
      fLo = C / (wlc + dwl / 2);
      fHi = C / (wlc - dwl / 2);
    } else if (sk.kind === 'f') {
      const df = spanValue * sk.k;
      fLo = fc - df / 2; fHi = fc + df / 2;
    } else if (sk.kind === 'wn') {
      const k = fc / C / 100, dk = spanValue;
      fLo = (k - dk / 2) * 100 * C; fHi = (k + dk / 2) * 100 * C;
    } else {
      const e = fc * H / QE, de = spanValue;
      fLo = (e - de / 2) * QE / H; fHi = (e + de / 2) * QE / H;
    }
    if (!(fLo > 0)) throw new Error('span exceeds 2x center');
    return rangeFromEndpoints(fLo, fHi);
  }

  /** Range from two frequencies (Hz). Reports both domains. */
  function rangeFromEndpoints(f1, f2) {
    const fLo = Math.min(f1, f2), fHi = Math.max(f1, f2);
    const wlLo = C / fHi, wlHi = C / fLo;
    return {
      fLo, fHi,
      fCenter: (fLo + fHi) / 2,
      fSpan: fHi - fLo,
      wlLo, wlHi,
      wlCenter: (wlLo + wlHi) / 2,
      wlSpan: wlHi - wlLo,
      wnSpanCm: (fHi - fLo) / C / 100,
    };
  }

  /** Linewidth conversion at a centre wavelength (small-signal, dν = c dλ / λ²). */
  const dlToDf = (dl, wl) => C * dl / (wl * wl);
  const dfToDl = (df, wl) => df * wl * wl / C;

  // ---------------------------------------------------------------- Fabry-Perot
  /**
   * Forward FP: cavity length L (m), index n, mirror reflectivities R1, R2 (0..1),
   * wavelength (m), extra single-pass intensity loss (0..1, default 0).
   */
  function fabryPerot({ L, n = 1, R1, R2 = R1, wl, loss = 0, angleRad = 0 }) {
    const cosT = Math.cos(angleRad);
    const fsrHz = C / (2 * n * L * cosT);
    const fsrM = wl * wl / (2 * n * L * cosT);
    // Effective round-trip reflectivity including internal loss.
    const Reff = Math.sqrt(R1 * R2) * (1 - loss);
    const finesse = PI * Math.sqrt(Reff) / (1 - Reff);
    const coefF = 4 * Reff / Math.pow(1 - Reff, 2);
    const fwhmHz = fsrHz / finesse;
    const fHz = C / wl;
    const tauPhoton = 1 / (2 * PI * fwhmHz);
    // Peak transmission for a lossless-ish asymmetric cavity (intensity).
    const T1 = 1 - R1, T2 = 1 - R2;
    const gloss = (1 - loss);
    const Tpeak = (T1 * T2 * gloss) / Math.pow(1 - Reff, 2);
    return {
      fsrHz, fsrM, finesse, coefF, Reff,
      fwhmHz, fwhmM: dfToDl(fwhmHz, wl),
      Q: fHz / fwhmHz,
      tauPhoton,
      roundTrip: 2 * n * L / C,
      Tpeak: Math.min(Tpeak, 1),
      modeNumber: 2 * n * L * cosT / wl,
    };
  }

  /** Airy transmission (normalised to peak) vs detuning in units of FSR. */
  function airy(phaseFsr, coefF) {
    const s = Math.sin(PI * phaseFsr);
    return 1 / (1 + coefF * s * s);
  }

  /** Inverse: reflectivity (equal mirrors) needed for a reflectivity finesse. */
  function reflectivityFromFinesse(F) {
    // F = π√R/(1−R); x = √R:  F x² + π x − F = 0
    const x = (-PI + Math.sqrt(PI * PI + 4 * F * F)) / (2 * F);
    return x * x;
  }
  /** Inverse: cavity length for a given FSR (Hz). */
  const lengthFromFsrHz = (fsrHz, n = 1) => C / (2 * n * fsrHz);
  /** Inverse: cavity length for a given FSR in wavelength (m) at wl. */
  const lengthFromFsrM = (fsrM, wl, n = 1) => wl * wl / (2 * n * fsrM);

  // ---------------------------------------------------------------- nonlinear mixing
  /**
   * Frequency mixing. Inputs are frequencies (Hz). Returns output frequency (Hz).
   * process: 'sfg' | 'dfg' | 'shg' | 'thg' | 'fhg' | 'fwm' (2ω1 − ω2) | 'idler' (ωp − ωs)
   */
  function mix(process, f1, f2) {
    switch (process) {
      case 'sfg': return f1 + f2;
      case 'dfg': return Math.abs(f1 - f2);
      case 'idler': return f1 - f2;
      case 'shg': return 2 * f1;
      case 'thg': return 3 * f1;
      case 'fhg': return 4 * f1;
      case 'fwm': return 2 * f1 - f2;
      case 'fwm2': return 2 * f2 - f1;
      default: throw new Error(`unknown process ${process}`);
    }
  }
  /** Convenience in wavelengths (m). */
  const mixWl = (process, wl1, wl2) => C / mix(process, C / wl1, wl2 ? C / wl2 : NaN);

  // ---------------------------------------------------------------- photon / pulse
  function photon({ wl, powerW = 0 }) {
    const E = H * C / wl;
    return { energyJ: E, energyEv: E / QE, rate: powerW / E, momentum: H / wl };
  }

  /** Detector responsivity <-> quantum efficiency. */
  const responsivityFromQe = (qe, wl) => qe * QE * wl / (H * C);
  const qeFromResponsivity = (r, wl) => r * H * C / (QE * wl);

  const TBP = { gaussian: 0.4413, sech2: 0.3148, lorentzian: 0.1420, square: 0.8859 };

  /** Pulse train: average power, repetition rate, FWHM duration, shape. */
  function pulse({ avgW, repHz, durS, shape = 'gaussian', wl = null }) {
    const energy = avgW / repHz;
    // peak factor: Ppeak = k * E / tau
    const k = { gaussian: 0.9394, sech2: 0.8814, square: 1, lorentzian: 0.6366 }[shape];
    const out = {
      energyJ: energy,
      peakW: k * energy / durS,
      dutyCycle: durS * repHz,
      period: 1 / repHz,
      tlBandwidthHz: TBP[shape] / durS,
    };
    if (wl) out.tlBandwidthM = dfToDl(out.tlBandwidthHz, wl);
    return out;
  }

  /** Coherence from linewidth Δν (Hz), medium index n. */
  function coherence(dfHz, n = 1) {
    return { timeS: 1 / (PI * dfHz), lengthM: C / (n * PI * dfHz), lengthSimpleM: C / (n * dfHz) };
  }

  // ---------------------------------------------------------------- Gaussian beam
  /**
   * w0: waist radius 1/e² (m), wl (m), M², n medium, z distance from waist (m).
   */
  function gaussianBeam({ w0, wl, M2 = 1, n = 1, z = 0 }) {
    const zR = PI * w0 * w0 * n / (M2 * wl);
    const theta = M2 * wl / (PI * w0 * n);         // half-angle far-field divergence
    const wz = w0 * Math.sqrt(1 + Math.pow(z / zR, 2));
    const Rz = z === 0 ? Infinity : z * (1 + Math.pow(zR / z, 2));
    const gouy = Math.atan(z / zR);
    return { zR, theta, fullAngle: 2 * theta, wz, Rz, gouy, dof: 2 * zR, bpp: w0 * theta };
  }

  /** Focused waist from a collimated beam of radius wIn through lens f (thin lens, far-field). */
  const focusWaist = ({ wIn, f, wl, M2 = 1 }) => M2 * wl * f / (PI * wIn);

  /** Peak irradiance of a Gaussian beam (W/m²). */
  const gaussianPeakIntensity = (P, w) => 2 * P / (PI * w * w);

  // ---------------------------------------------------------------- fiber
  function fiber({ nCore, nClad, coreRadius, wl }) {
    const NA = Math.sqrt(Math.max(nCore * nCore - nClad * nClad, 0));
    const V = 2 * PI * coreRadius * NA / wl;
    return {
      NA,
      acceptanceHalfAngle: Math.asin(Math.min(NA, 1)),
      V,
      singleMode: V < 2.405,
      cutoffWl: 2 * PI * coreRadius * NA / 2.405,
      approxModes: V < 2.405 ? 1 : Math.round(V * V / 2),
      // Marcuse approximation for MFD (valid 0.8 < V < 2.5)
      mfd: 2 * coreRadius * (0.65 + 1.619 / Math.pow(V, 1.5) + 2.879 / Math.pow(V, 6)),
      deltaRel: (nCore - nClad) / nCore,
    };
  }

  /** Chromatic dispersion broadening. D in ps/(nm·km), L in km, dλ in nm -> s. */
  const dispersionBroadening = (D, Lkm, dlNm) => Math.abs(D * Lkm * dlNm) * 1e-12;

  /** Group delay over length L (m) for group index ng. */
  const groupDelay = (L, ng) => L * ng / C;

  // ---------------------------------------------------------------- formatting
  const SI_PREFIX = [
    [1e15, 'P'], [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'], [1e-18, 'a'],
  ];
  function num(x, sig = 6) {
    if (x == null || Number.isNaN(x)) return '—';
    if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
    if (x === 0) return '0';
    const a = Math.abs(x);
    let s;
    if (a >= 1e-4 && a < 1e9) s = Number(x.toPrecision(sig)).toString();
    else s = x.toExponential(sig - 1).replace(/\.?0+e/, 'e').replace('e+', 'e');
    return s.replace('-', '−');
  }
  /** Format with an automatic SI prefix: si(1.55e-6,'m') -> "1.55 µm". */
  function si(x, unit, sig = 6, { minExp = -18, maxExp = 15 } = {}) {
    if (x == null || Number.isNaN(x)) return '—';
    if (!Number.isFinite(x)) return (x > 0 ? '∞ ' : '−∞ ') + unit;
    if (x === 0) return `0 ${unit}`;
    const a = Math.abs(x);
    for (const [f, p] of SI_PREFIX) {
      if (f > Math.pow(10, maxExp) || f < Math.pow(10, minExp)) continue;
      if (a >= f * 0.9999995) return `${num(x / f, sig)} ${p}${unit}`;
    }
    const f = SI_PREFIX[SI_PREFIX.length - 1][0];
    return `${num(x / f, sig)} ${SI_PREFIX[SI_PREFIX.length - 1][1]}${unit}`;
  }
  /** Wavelength-friendly: nm below 10 µm, µm above. */
  function wl(x, sig = 6) {
    if (!Number.isFinite(x)) return num(x);
    const a = Math.abs(x);
    if (a < 1e-9) return `${num(x * 1e12, sig)} pm`;
    if (a < 1e-5) return `${num(x * 1e9, sig)} nm`;
    if (a < 1e-3) return `${num(x * 1e6, sig)} µm`;
    return si(x, 'm', sig);
  }

  return {
    C, H, QE, UNITS, SPECTRAL, TBP,
    toSI, fromSI, spectralToHz, hzToSpectral, isWavelengthUnit,
    ratioToDb, dbToRatio, ampRatioToDb, dbToAmpRatio, wToDbm, dbmToW, powerToW, wToPower, gainSolve,
    spectralPoint, rangeFromCenterSpan, rangeFromEndpoints, dlToDf, dfToDl,
    fabryPerot, airy, reflectivityFromFinesse, lengthFromFsrHz, lengthFromFsrM,
    mix, mixWl,
    photon, responsivityFromQe, qeFromResponsivity, pulse, coherence,
    gaussianBeam, focusWaist, gaussianPeakIntensity,
    fiber, dispersionBroadening, groupDelay,
    fmt: { num, si, wl },
  };
});
