const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/calc.js');

const close = (a, b, rel = 1e-9, msg) =>
  assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300), msg || `${a} != ${b}`);

test('dB basics', () => {
  close(K.ratioToDb(2), 3.0103, 1e-5);
  close(K.dbToRatio(10), 10);
  close(K.ampRatioToDb(10), 20);
  close(K.wToDbm(1e-3), 0, 1e-12);
  close(K.dbmToW(30), 1);
  close(K.powerToW(-10, 'dBm'), 1e-4);
  close(K.powerToW(0, 'dBW'), 1);
  close(K.wToPower(0.5, 'mW'), 500);
});

test('gain triangle solves each unknown', () => {
  const a = K.gainSolve({ pinW: 1e-3, poutW: 1e-1 });
  close(a.gainDb, 20);
  const b = K.gainSolve({ pinW: 1e-3, gainDb: 20 });
  close(b.poutW, 0.1);
  const c = K.gainSolve({ poutW: 0.1, gainDb: 20 });
  close(c.pinW, 1e-3);
  assert.throws(() => K.gainSolve({ pinW: 1 }));
});

test('spectral conversions', () => {
  close(K.spectralToHz(1550, 'nm'), 193.414489e12, 1e-8);
  close(K.hzToSpectral(193.414489032e12, 'nm'), 1550, 1e-9);
  close(K.spectralToHz(1, 'eV'), 241.798924e12, 1e-8);
  close(K.hzToSpectral(K.spectralToHz(6500, 'cm⁻¹'), 'µm'), 1 / 0.65, 1e-12);
  const p = K.spectralPoint(K.spectralToHz(1064, 'nm'), 1.5);
  close(p.wlMedium, 1064e-9 / 1.5);
  close(p.photonEv, 1.16527, 1e-5);
});

test('range from center + wavelength span', () => {
  const r = K.rangeFromCenterSpan(1550, 'nm', 10, 'nm');
  close(r.wlLo, 1545e-9);
  close(r.wlHi, 1555e-9);
  close(r.fLo, K.C / 1555e-9);
  close(r.fHi, K.C / 1545e-9);
  // ≈ 1.2479 THz for 10 nm at 1550
  close(r.fSpan, 1.24796e12, 1e-4);
});

test('range from center wavelength + frequency span', () => {
  const r = K.rangeFromCenterSpan(1550, 'nm', 100, 'GHz');
  const fc = K.C / 1550e-9;
  close(r.fLo, fc - 50e9);
  close(r.fHi, fc + 50e9);
  close(r.fSpan, 100e9);
  close(r.wlSpan, 0.80146e-9, 1e-4);
});

test('range rejects impossible span', () => {
  assert.throws(() => K.rangeFromCenterSpan(1000, 'nm', 2500, 'nm'));
  assert.throws(() => K.rangeFromCenterSpan(1, 'THz', 3, 'THz'));
});

test('linewidth conversion', () => {
  close(K.dlToDf(0.8e-9, 1550e-9), 99.83e9, 1e-3);
  close(K.dfToDl(K.dlToDf(1e-12, 1e-6), 1e-6), 1e-12);
});

test('Fabry-Perot forward', () => {
  // 1 cm air-spaced, R = 0.99
  const fp = K.fabryPerot({ L: 0.01, n: 1, R1: 0.99, wl: 1550e-9 });
  close(fp.fsrHz, 14.9896229e9, 1e-8);
  close(fp.finesse, Math.PI * Math.sqrt(0.99) / 0.01, 1e-12);
  close(fp.finesse, 312.58, 1e-4);
  close(fp.fwhmHz, fp.fsrHz / fp.finesse);
  close(fp.fsrM, 1550e-9 ** 2 / 0.02);
  close(fp.Tpeak, 1, 1e-12);
  close(K.airy(0, fp.coefF), 1);
  // half-max at detuning FWHM/2
  close(K.airy(0.5 / fp.finesse, fp.coefF), 0.5, 1e-4);
});

test('Fabry-Perot inverse round trips', () => {
  for (const R of [0.3, 0.9, 0.999]) {
    const F = Math.PI * Math.sqrt(R) / (1 - R);
    close(K.reflectivityFromFinesse(F), R, 1e-12);
  }
  close(K.lengthFromFsrHz(10e9, 1), 0.0149896229, 1e-8);
  const L = K.lengthFromFsrM(1e-9, 1550e-9, 1.444);
  close(K.fabryPerot({ L, n: 1.444, R1: 0.9, wl: 1550e-9 }).fsrM, 1e-9, 1e-12);
});

test('nonlinear mixing', () => {
  close(K.mixWl('shg', 1064e-9), 532e-9);
  close(K.mixWl('thg', 1064e-9), 1064e-9 / 3);
  // SFG 1064 + 1550 -> 630.9 nm
  close(K.mixWl('sfg', 1064e-9, 1550e-9), 1 / (1 / 1064e-9 + 1 / 1550e-9));
  // DFG 1064 - 1550 -> 3393.4 nm
  close(K.mixWl('dfg', 1064e-9, 1550e-9), 1 / (1 / 1064e-9 - 1 / 1550e-9));
  close(K.mixWl('dfg', 1550e-9, 1064e-9), K.mixWl('dfg', 1064e-9, 1550e-9));
  // OPO idler: pump 532, signal 800
  close(K.mixWl('idler', 532e-9, 800e-9), 1 / (1 / 532e-9 - 1 / 800e-9));
  close(K.mix('fwm', 10, 3), 17);
});

test('photon and detector', () => {
  const p = K.photon({ wl: 1550e-9, powerW: 1e-3 });
  close(p.energyEv, 0.799898, 1e-5);
  close(p.rate, 7.8026e15, 1e-4);
  close(K.responsivityFromQe(1, 1550e-9), 1.25, 2e-3);
  close(K.qeFromResponsivity(K.responsivityFromQe(0.8, 1e-6), 1e-6), 0.8);
});

test('pulse train', () => {
  const p = K.pulse({ avgW: 1, repHz: 80e6, durS: 100e-15, shape: 'sech2', wl: 800e-9 });
  close(p.energyJ, 12.5e-9);
  close(p.peakW, 0.8814 * 12.5e-9 / 100e-15, 1e-12);
  close(p.tlBandwidthHz, 3.148e12, 1e-12);
});

test('Gaussian beam', () => {
  const g = K.gaussianBeam({ w0: 1e-3, wl: 1064e-9, z: 0 });
  close(g.zR, Math.PI * 1e-6 / 1064e-9);
  close(g.theta, 1064e-9 / (Math.PI * 1e-3));
  close(g.wz, 1e-3);
  assert.equal(g.Rz, Infinity);
  const g2 = K.gaussianBeam({ w0: 1e-3, wl: 1064e-9, z: g.zR });
  close(g2.wz, Math.SQRT2 * 1e-3);
  close(g2.Rz, 2 * g.zR);
  close(K.focusWaist({ wIn: 2e-3, f: 0.1, wl: 1064e-9 }), 1064e-9 * 0.1 / (Math.PI * 2e-3));
});

test('fiber (SMF-28-like)', () => {
  const f = K.fiber({ nCore: 1.4504, nClad: 1.4447, coreRadius: 4.1e-6, wl: 1550e-9 });
  close(f.NA, 0.1285, 2e-3);
  assert.ok(f.singleMode);
  assert.ok(f.cutoffWl > 1.2e-6 && f.cutoffWl < 1.45e-6);
  assert.ok(f.mfd > 9e-6 && f.mfd < 11.5e-6);
  close(K.dispersionBroadening(17, 10, 0.1), 17e-12);
  close(K.groupDelay(1000, 1.468), 4.8967e-6, 1e-4);
});

test('formatting', () => {
  assert.equal(K.fmt.si(1.55e-6, 'm', 4), '1.55 µm');
  assert.equal(K.fmt.si(193.4144e12, 'Hz', 7), '193.4144 THz');
  assert.equal(K.fmt.si(1, 'W'), '1 W');
  assert.equal(K.fmt.wl(1550e-9), '1550 nm');
  assert.equal(K.fmt.wl(3.39e-6), '3390 nm');
  assert.equal(K.fmt.wl(12e-6), '12 µm');
  assert.equal(K.fmt.num(-2.5), '−2.5');
  assert.equal(K.fmt.num(NaN), '—');
});
