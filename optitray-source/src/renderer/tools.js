/* Tool definitions. Each tool declares its inputs (optionally per mode) and a compute()
 * that returns result rows:  [label, text, opts]  |  {h: 'Section'}  |  {note}  |  {plot}  */
(function () {
  const K = window.Calc;
  const F = K.fmt;
  const SPEC = ['nm', 'µm', 'THz', 'GHz', 'cm⁻¹', 'eV'];
  const LEN = ['nm', 'µm', 'mm', 'cm', 'm', 'km'];
  const POW = ['nW', 'µW', 'mW', 'W', 'kW', 'dBm', 'dBW'];
  const FREQ = ['Hz', 'kHz', 'MHz', 'GHz', 'THz'];
  const TIME = ['fs', 'ps', 'ns', 'µs', 'ms', 's'];

  const L = (v, u) => K.toSI(v, 'length', u);
  const hz = (f) => F.si(f, 'Hz', 7);
  const wl = (m) => F.wl(m, 7);
  const pw = (w) => F.si(w, 'W', 5);
  const dbm = (w) => `${F.num(K.wToDbm(w), 5)} dBm`;
  const deg = (r) => `${F.num(r * 180 / Math.PI, 5)}°`;
  const pct = (x) => `${F.num(x * 100, 5)} %`;
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };
  const pos = (x, name) => need(x > 0 && Number.isFinite(x), `${name} must be > 0`);

  // Linewidth / span unit that can live in either domain
  function spanToHz(val, unit, centerHz) {
    if (unit === 'Hz' || unit === 'kHz' || unit === 'MHz' || unit === 'GHz' || unit === 'THz') return K.toSI(val, 'freq', unit);
    if (unit === 'cm⁻¹') return val * 100 * K.C;
    return K.dlToDf(L(val, unit), K.C / centerHz);
  }

  function spectralRows(f, n) {
    const p = K.spectralPoint(f, n);
    const rows = [
      ['Wavelength (vacuum)', wl(p.wlVac), { main: true }],
      ['Frequency', hz(p.fHz), { main: true }],
    ];
    if (n !== 1) rows.push([`Wavelength in n = ${F.num(n)}`, wl(p.wlMedium)]);
    rows.push(
      ['Wavenumber', `${F.num(p.wavenumberCm, 7)} cm⁻¹`],
      ['Photon energy', `${F.num(p.photonEv, 6)} eV`],
      ['Angular frequency', `${F.num(p.omega, 6)} rad/s`],
      ['Optical period', F.si(p.period, 's', 6)],
    );
    return rows;
  }

  function rangeRows(r) {
    return [
      { h: 'Wavelength' },
      ['Start', wl(r.wlLo)],
      ['Stop', wl(r.wlHi)],
      ['Center (midpoint)', wl(r.wlCenter)],
      ['Span', wl(r.wlSpan), { main: true }],
      { h: 'Frequency' },
      ['Start', hz(r.fLo)],
      ['Stop', hz(r.fHi)],
      ['Center (midpoint)', hz(r.fCenter)],
      ['Span', hz(r.fSpan), { main: true }],
      { h: 'Other' },
      ['Wavenumber span', `${F.num(r.wnSpanCm, 6)} cm⁻¹`],
      ['c / λ-midpoint vs ν-midpoint', hz(K.C / r.wlCenter - r.fCenter)],
      { note: 'The span is symmetric in the domain you enter it in, so the midpoint in the other domain shifts slightly.' },
    ];
  }

  const TOOLS = [
    // ------------------------------------------------------------------ dB
    {
      id: 'db', name: 'dB & power', glyph: 'dB',
      desc: 'Gain in dB, dBm ↔ mW, ratio ↔ dB',
      modes: ['Gain', 'Convert', 'Ratio'],
      inputs: (m, v) => m === 'Gain' ? [
        { id: 'solve', label: 'Solve for', type: 'sel', options: ['Gain', 'Output power', 'Input power'], value: 'Gain' },
        ...(v.solve !== 'Input power' ? [{ id: 'pin', label: 'Input power', value: 1, units: POW, unit: 'mW' }] : []),
        ...(v.solve !== 'Output power' ? [{ id: 'pout', label: 'Output power', value: 100, units: POW, unit: 'mW' }] : []),
        ...(v.solve !== 'Gain' ? [{ id: 'gain', label: 'Gain', value: 20, unitLabel: 'dB' }] : []),
      ] : m === 'Convert' ? [
        { id: 'p', label: 'Power', value: 0, units: POW, unit: 'dBm' },
      ] : [
        { id: 'r', label: 'Value', value: 2 },
        { id: 'rtype', label: 'Input is', type: 'sel', options: ['Power ratio', 'Field / voltage ratio', 'dB'], value: 'Power ratio' },
      ],
      compute(m, v, u) {
        if (m === 'Gain') {
          const args = {};
          if (v.solve !== 'Input power') { args.pinW = K.powerToW(v.pin, u.pin); pos(args.pinW, 'Input power'); }
          if (v.solve !== 'Output power') { args.poutW = K.powerToW(v.pout, u.pout); pos(args.poutW, 'Output power'); }
          if (v.solve !== 'Gain') args.gainDb = v.gain;
          const g = K.gainSolve(args);
          const target = { Gain: 'gain', 'Output power': 'out', 'Input power': 'in' }[v.solve];
          return [
            ['Gain', `${F.num(g.gainDb, 6)} dB`, { main: target === 'gain' }],
            ['Power ratio', `× ${F.num(g.ratio, 6)}`],
            ['Field ratio', `× ${F.num(Math.sqrt(g.ratio), 6)}`],
            ['Output power', `${pw(g.poutW)}  ·  ${dbm(g.poutW)}`, { main: target === 'out' }],
            ['Input power', `${pw(g.pinW)}  ·  ${dbm(g.pinW)}`, { main: target === 'in' }],
            ['Gain (as loss)', g.gainDb < 0 ? `${F.num(-g.gainDb, 6)} dB loss` : '—'],
          ];
        }
        if (m === 'Convert') {
          const w = K.powerToW(v.p, u.p);
          pos(w, 'Power');
          return [
            ['dBm', `${F.num(K.wToDbm(w), 7)} dBm`, { main: true }],
            ['Watts', pw(w), { main: true }],
            ['mW', `${F.num(w * 1e3, 7)} mW`],
            ['dBW', `${F.num(10 * Math.log10(w), 7)} dBW`],
            ['dBµW', `${F.num(10 * Math.log10(w / 1e-6), 7)} dBµW`],
          ];
        }
        if (v.rtype === 'dB') {
          return [
            ['Power ratio', `× ${F.num(K.dbToRatio(v.r), 7)}`, { main: true }],
            ['Field / voltage ratio', `× ${F.num(K.dbToAmpRatio(v.r), 7)}`],
            ['Transmission (power)', pct(K.dbToRatio(-Math.abs(v.r)))],
          ];
        }
        pos(v.r, 'Ratio');
        const db = v.rtype === 'Power ratio' ? K.ratioToDb(v.r) : K.ampRatioToDb(v.r);
        return [
          ['dB', `${F.num(db, 7)} dB`, { main: true }],
          ['Equivalent power ratio', `× ${F.num(K.dbToRatio(db), 7)}`],
          ['Equivalent field ratio', `× ${F.num(K.dbToAmpRatio(db), 7)}`],
        ];
      },
    },

    // ------------------------------------------------------------------ spectral
    {
      id: 'spectral', name: 'Wavelength ↔ frequency', glyph: 'λν',
      desc: 'Single value, center + span, start / stop',
      modes: ['Single', 'Center + span', 'Start / stop'],
      inputs: (m) => m === 'Single' ? [
        { id: 'x', label: 'Value', value: 1550, units: SPEC, unit: 'nm' },
        { id: 'n', label: 'Refractive index', value: 1 },
      ] : m === 'Center + span' ? [
        { id: 'c', label: 'Center', value: 1550, units: SPEC, unit: 'nm' },
        { id: 's', label: 'Total span', value: 10, units: ['nm', 'pm', 'µm', 'GHz', 'THz', 'cm⁻¹'], unit: 'nm' },
      ] : [
        { id: 'a', label: 'Start', value: 1530, units: SPEC, unit: 'nm' },
        { id: 'b', label: 'Stop', value: 1565, units: SPEC, unit: 'nm' },
      ],
      compute(m, v, u) {
        if (m === 'Single') {
          pos(v.x, 'Value'); pos(v.n, 'Index');
          return spectralRows(K.spectralToHz(v.x, u.x), v.n);
        }
        if (m === 'Center + span') {
          pos(v.c, 'Center'); pos(v.s, 'Span');
          return rangeRows(K.rangeFromCenterSpan(v.c, u.c, v.s, u.s));
        }
        pos(v.a, 'Start'); pos(v.b, 'Stop');
        return rangeRows(K.rangeFromEndpoints(K.spectralToHz(v.a, u.a), K.spectralToHz(v.b, u.b)));
      },
    },

    // ------------------------------------------------------------------ Fabry-Perot
    {
      id: 'fp', name: 'Fabry–Pérot', glyph: 'FP',
      desc: 'FSR, finesse, linewidth ↔ length, reflectivity',
      modes: ['Cavity → FSR', 'FSR → cavity'],
      inputs: (m) => m === 'Cavity → FSR' ? [
        { id: 'L', label: 'Cavity length', value: 10, units: LEN, unit: 'mm' },
        { id: 'n', label: 'Refractive index', value: 1 },
        { id: 'R1', label: 'Mirror R1', value: 99, unitLabel: '%' },
        { id: 'R2', label: 'Mirror R2', value: 99, unitLabel: '%' },
        { id: 'wl', label: 'Wavelength', value: 1550, units: SPEC, unit: 'nm' },
        { id: 'loss', label: 'Loss per pass', value: 0, unitLabel: '%' },
        { id: 'ang', label: 'Internal angle', value: 0, unitLabel: '°' },
      ] : [
        { id: 'fsr', label: 'FSR', value: 10, units: ['MHz', 'GHz', 'THz', 'pm', 'nm'], unit: 'GHz' },
        { id: 'fin', label: 'Finesse / FWHM', value: 100, units: ['finesse', 'kHz', 'MHz', 'GHz', 'pm', 'nm'], unit: 'finesse' },
        { id: 'n', label: 'Refractive index', value: 1 },
        { id: 'wl', label: 'Wavelength', value: 1550, units: SPEC, unit: 'nm' },
      ],
      compute(m, v, u) {
        const lam = K.C / K.spectralToHz(v.wl, u.wl);
        pos(lam, 'Wavelength'); pos(v.n, 'Index');
        if (m === 'Cavity → FSR') {
          const Lm = L(v.L, u.L);
          pos(Lm, 'Length');
          need(v.R1 > 0 && v.R1 < 100 && v.R2 > 0 && v.R2 < 100, 'Reflectivity must be between 0 and 100 %');
          need(v.loss >= 0 && v.loss < 100, 'Loss must be 0–100 %');
          const r = K.fabryPerot({ L: Lm, n: v.n, R1: v.R1 / 100, R2: v.R2 / 100, wl: lam, loss: v.loss / 100, angleRad: v.ang * Math.PI / 180 });
          return [
            { h: 'Spectral' },
            ['FSR', hz(r.fsrHz), { main: true }],
            ['FSR (wavelength)', wl(r.fsrM), { main: true }],
            ['Finesse', F.num(r.finesse, 6), { main: true }],
            ['FWHM linewidth', hz(r.fwhmHz)],
            ['FWHM (wavelength)', wl(r.fwhmM)],
            ['Q factor', F.num(r.Q, 5)],
            ['Coefficient of finesse F', F.num(r.coefF, 6)],
            {
              plot: (ctx, w, h, css) => {
                // Airy transmission across two FSRs
                ctx.strokeStyle = css.border; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(0, h - 0.5); ctx.lineTo(w, h - 0.5); ctx.stroke();
                ctx.fillStyle = css.muted; ctx.font = '10px Segoe UI, sans-serif';
                ctx.fillText('T(ν)  ·  2 FSR', 4, 11);
                ctx.strokeStyle = css.accent; ctx.lineWidth = 1.5; ctx.beginPath();
                const N = Math.max(600, Math.min(4000, Math.round(r.finesse * 8)));
                for (let i = 0; i <= N; i++) {
                  const x = i / N, t = K.airy(x * 2 - 1, r.coefF) * r.Tpeak;
                  const px = x * w, py = h - 2 - t * (h - 16);
                  i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.stroke();
              },
            },
            { h: 'Cavity' },
            ['Peak transmission', pct(r.Tpeak)],
            ['Round-trip time', F.si(r.roundTrip, 's', 6)],
            ['Photon lifetime', F.si(r.tauPhoton, 's', 5)],
            ['Longitudinal mode number', F.num(r.modeNumber, 7)],
            ['Effective R (incl. loss)', pct(r.Reff)],
          ];
        }
        pos(v.fsr, 'FSR'); pos(v.fin, 'Finesse / FWHM');
        const fsrHz = ['pm', 'nm'].includes(u.fsr) ? K.dlToDf(L(v.fsr, u.fsr), lam) : K.toSI(v.fsr, 'freq', u.fsr);
        const Lm = K.lengthFromFsrHz(fsrHz, v.n);
        let finesse, fwhm;
        if (u.fin === 'finesse') { finesse = v.fin; fwhm = fsrHz / finesse; }
        else {
          fwhm = ['pm', 'nm'].includes(u.fin) ? K.dlToDf(L(v.fin, u.fin), lam) : K.toSI(v.fin, 'freq', u.fin);
          finesse = fsrHz / fwhm;
        }
        need(finesse > 0.5, 'Finesse too low (FWHM larger than FSR)');
        const R = K.reflectivityFromFinesse(finesse);
        return [
          ['Cavity length', F.si(Lm, 'm', 6), { main: true }],
          ['Optical length n·L', F.si(Lm * v.n, 'm', 6)],
          ['Mirror reflectivity (equal)', pct(R), { main: true }],
          ['Finesse', F.num(finesse, 6)],
          ['FWHM linewidth', hz(fwhm)],
          ['FWHM (wavelength)', wl(K.dfToDl(fwhm, lam))],
          ['FSR', `${hz(fsrHz)}  ·  ${wl(K.dfToDl(fsrHz, lam))}`],
          ['Photon lifetime', F.si(1 / (2 * Math.PI * fwhm), 's', 5)],
          { note: 'Reflectivity assumes two identical lossless mirrors (reflectivity-limited finesse).' },
        ];
      },
    },

    // ------------------------------------------------------------------ mixing
    {
      id: 'mix', name: 'Frequency mixing', glyph: 'χ²',
      desc: 'SFG, DFG, SHG, THG, OPO idler, FWM',
      inputs: (m, v) => {
        const single = ['SHG (2ω)', 'THG (3ω)', '4HG (4ω)'].includes(v.proc);
        const lbl = v.proc === 'OPO idler (ωp − ωs)' ? ['Pump', 'Signal'] : ['Input 1', 'Input 2'];
        return [
          { id: 'proc', label: 'Process', type: 'sel', value: 'SFG (ω1 + ω2)', options: ['SFG (ω1 + ω2)', 'DFG (|ω1 − ω2|)', 'SHG (2ω)', 'THG (3ω)', '4HG (4ω)', 'OPO idler (ωp − ωs)', 'FWM (2ω1 − ω2)', 'FWM (2ω2 − ω1)'] },
          { id: 'a', label: single ? 'Fundamental' : lbl[0], value: 1064, units: SPEC, unit: 'nm' },
          ...(single ? [] : [{ id: 'b', label: lbl[1], value: 1550, units: SPEC, unit: 'nm' }]),
        ];
      },
      compute(m, v, u) {
        pos(v.a, 'Input 1');
        const key = { 'SFG (ω1 + ω2)': 'sfg', 'DFG (|ω1 − ω2|)': 'dfg', 'SHG (2ω)': 'shg', 'THG (3ω)': 'thg', '4HG (4ω)': 'fhg', 'OPO idler (ωp − ωs)': 'idler', 'FWM (2ω1 − ω2)': 'fwm', 'FWM (2ω2 − ω1)': 'fwm2' }[v.proc];
        const f1 = K.spectralToHz(v.a, u.a);
        const f2 = 'b' in v ? (pos(v.b, 'Input 2'), K.spectralToHz(v.b, u.b)) : NaN;
        const f3 = K.mix(key, f1, f2);
        need(f3 > 0, key === 'idler' ? 'Signal frequency must be below the pump (signal λ > pump λ)' : 'Output frequency is not positive');
        const p = K.spectralPoint(f3);
        const eq = {
          sfg: '1/λ₃ = 1/λ₁ + 1/λ₂', dfg: '1/λ₃ = |1/λ₁ − 1/λ₂|', shg: 'λ₂ω = λ / 2', thg: 'λ₃ω = λ / 3', fhg: 'λ₄ω = λ / 4',
          idler: '1/λᵢ = 1/λp − 1/λs', fwm: 'ω₃ = 2ω₁ − ω₂', fwm2: 'ω₃ = 2ω₂ − ω₁',
        }[key];
        const rows = [
          { h: 'Output' },
          ['Wavelength', wl(p.wlVac), { main: true }],
          ['Frequency', hz(f3), { main: true }],
          ['Wavenumber', `${F.num(p.wavenumberCm, 7)} cm⁻¹`],
          ['Photon energy', `${F.num(p.photonEv, 6)} eV`],
          { h: 'Inputs' },
          ['Input 1', `${wl(K.C / f1)}  ·  ${hz(f1)}`],
        ];
        if (Number.isFinite(f2)) rows.push(['Input 2', `${wl(K.C / f2)}  ·  ${hz(f2)}`]);
        rows.push({ note: eq + '  (vacuum wavelengths, energy conservation only, no phase matching)' });
        return rows;
      },
    },

    // ------------------------------------------------------------------ photon
    {
      id: 'photon', name: 'Photon & detector', glyph: 'hν',
      desc: 'Photon energy, flux, photocurrent, responsivity',
      inputs: () => [
        { id: 'wl', label: 'Wavelength', value: 1550, units: SPEC, unit: 'nm' },
        { id: 'p', label: 'Optical power', value: 1, units: POW, unit: 'mW' },
        { id: 'qe', label: 'Quantum efficiency', value: 80, unitLabel: '%' },
      ],
      compute(m, v, u) {
        const f = K.spectralToHz(v.wl, u.wl);
        pos(f, 'Wavelength');
        const lam = K.C / f;
        const P = K.powerToW(v.p, u.p);
        const ph = K.photon({ wl: lam, powerW: P });
        const R = K.responsivityFromQe(v.qe / 100, lam);
        return [
          ['Photon energy', `${F.num(ph.energyEv, 6)} eV`, { main: true }],
          ['Photon energy (J)', `${F.num(ph.energyJ, 6)} J`],
          ['Photon rate', `${F.num(ph.rate, 6)} photons/s`, { main: true }],
          ['Photon momentum', `${F.num(ph.momentum, 5)} kg·m/s`],
          { h: 'Detector' },
          ['Responsivity', `${F.num(R, 5)} A/W`, { main: true }],
          ['Ideal responsivity (QE 100 %)', `${F.num(K.responsivityFromQe(1, lam), 5)} A/W`],
          ['Photocurrent', F.si(R * P, 'A', 5)],
          ['Shot-noise current density', `${F.num(Math.sqrt(2 * K.QE * R * P) * 1e12, 4)} pA/√Hz`],
        ];
      },
    },

    // ------------------------------------------------------------------ linewidth
    {
      id: 'linewidth', name: 'Linewidth & coherence', glyph: 'Δν',
      desc: 'Δλ ↔ Δν, coherence length, transform limit',
      inputs: () => [
        { id: 'c', label: 'Center', value: 1550, units: SPEC, unit: 'nm' },
        { id: 'd', label: 'Linewidth (FWHM)', value: 0.1, units: ['pm', 'nm', 'Hz', 'kHz', 'MHz', 'GHz', 'THz', 'cm⁻¹'], unit: 'nm' },
        { id: 'n', label: 'Refractive index', value: 1 },
      ],
      compute(m, v, u) {
        const fc = K.spectralToHz(v.c, u.c);
        pos(fc, 'Center'); pos(v.d, 'Linewidth'); pos(v.n, 'Index');
        const lam = K.C / fc;
        const df = spanToHz(v.d, u.d, fc);
        const co = K.coherence(df, v.n);
        return [
          ['Δν', hz(df), { main: true }],
          ['Δλ', wl(K.dfToDl(df, lam)), { main: true }],
          ['Δk', `${F.num(df / K.C / 100, 6)} cm⁻¹`],
          ['Q = ν / Δν', F.num(fc / df, 6)],
          { h: 'Coherence' },
          ['Coherence time 1/(πΔν)', F.si(co.timeS, 's', 5)],
          ['Coherence length c/(nπΔν)', F.si(co.lengthM, 'm', 5)],
          ['Coherence length c/(nΔν)', F.si(co.lengthSimpleM, 'm', 5)],
          { h: 'Transform-limited pulse' },
          ['Gaussian (0.441)', F.si(K.TBP.gaussian / df, 's', 4)],
          ['sech² (0.315)', F.si(K.TBP.sech2 / df, 's', 4)],
          { note: 'Coherence time uses the Lorentzian definition. Definitions vary by a factor of order 1.' },
        ];
      },
    },

    // ------------------------------------------------------------------ pulse
    {
      id: 'pulse', name: 'Pulse train', glyph: '⊓',
      desc: 'Pulse energy, peak power, fluence, TBP',
      inputs: () => [
        { id: 'p', label: 'Average power', value: 1, units: POW, unit: 'W' },
        { id: 'rep', label: 'Repetition rate', value: 80, units: FREQ, unit: 'MHz' },
        { id: 't', label: 'Pulse width (FWHM)', value: 100, units: TIME, unit: 'fs' },
        { id: 'shape', label: 'Pulse shape', type: 'sel', options: ['sech²', 'Gaussian', 'Lorentzian', 'Square'], value: 'sech²' },
        { id: 'wl', label: 'Wavelength', value: 800, units: SPEC, unit: 'nm' },
        { id: 'w', label: 'Beam radius 1/e²', value: 50, units: ['µm', 'mm'], unit: 'µm' },
      ],
      compute(m, v, u) {
        const P = K.powerToW(v.p, u.p), rep = K.toSI(v.rep, 'freq', u.rep), t = K.toSI(v.t, 'time', u.t);
        pos(P, 'Power'); pos(rep, 'Repetition rate'); pos(t, 'Pulse width');
        const shape = { 'sech²': 'sech2', Gaussian: 'gaussian', Lorentzian: 'lorentzian', Square: 'square' }[v.shape];
        const lam = K.C / K.spectralToHz(v.wl, u.wl);
        const r = K.pulse({ avgW: P, repHz: rep, durS: t, shape, wl: lam });
        const rows = [
          ['Pulse energy', F.si(r.energyJ, 'J', 5), { main: true }],
          ['Peak power', F.si(r.peakW, 'W', 5), { main: true }],
          ['Pulse period', F.si(r.period, 's', 5)],
          ['Duty cycle', F.num(r.dutyCycle, 4)],
          ['Photons per pulse', F.num(r.energyJ / (K.H * K.C / lam), 4)],
          { h: 'Transform limit' },
          ['Min. bandwidth Δν', hz(r.tlBandwidthHz)],
          ['Min. bandwidth Δλ', wl(r.tlBandwidthM)],
          ['TBP used', F.num(K.TBP[shape], 4)],
        ];
        if (v.w > 0) {
          const w = L(v.w, u.w);
          rows.push(
            { h: 'At focus (Gaussian beam)' },
            ['Peak fluence', `${F.num(2 * r.energyJ / (Math.PI * w * w) * 1e-4, 5)} J/cm²`],
            ['Peak intensity', `${F.num(K.gaussianPeakIntensity(r.peakW, w) * 1e-4, 5)} W/cm²`],
            ['Average intensity', `${F.num(K.gaussianPeakIntensity(P, w) * 1e-4, 5)} W/cm²`],
          );
        }
        return rows;
      },
    },

    // ------------------------------------------------------------------ beam
    {
      id: 'beam', name: 'Gaussian beam', glyph: 'w₀',
      desc: 'Rayleigh range, divergence, w(z), focusing',
      modes: ['Waist → propagation', 'Lens focusing'],
      inputs: (m) => m === 'Waist → propagation' ? [
        { id: 'wl', label: 'Wavelength', value: 1064, units: SPEC, unit: 'nm' },
        { id: 'w0', label: 'Waist radius 1/e²', value: 1, units: ['µm', 'mm'], unit: 'mm' },
        { id: 'M2', label: 'M²', value: 1 },
        { id: 'n', label: 'Refractive index', value: 1 },
        { id: 'z', label: 'Distance from waist', value: 1, units: ['mm', 'cm', 'm'], unit: 'm' },
      ] : [
        { id: 'wl', label: 'Wavelength', value: 1064, units: SPEC, unit: 'nm' },
        { id: 'win', label: 'Input beam radius', value: 2, units: ['µm', 'mm'], unit: 'mm' },
        { id: 'f', label: 'Focal length', value: 100, units: ['mm', 'cm', 'm'], unit: 'mm' },
        { id: 'M2', label: 'M²', value: 1 },
      ],
      compute(m, v, u) {
        const lam = K.C / K.spectralToHz(v.wl, u.wl);
        pos(lam, 'Wavelength'); pos(v.M2, 'M²');
        if (m === 'Waist → propagation') {
          const w0 = L(v.w0, u.w0), z = L(v.z, u.z);
          pos(w0, 'Waist'); pos(v.n, 'Index');
          const g = K.gaussianBeam({ w0, wl: lam, M2: v.M2, n: v.n, z });
          return [
            ['Rayleigh range zR', F.si(g.zR, 'm', 5), { main: true }],
            ['Depth of focus 2zR', F.si(g.dof, 'm', 5)],
            ['Divergence (half-angle)', F.si(g.theta, 'rad', 5), { main: true }],
            ['Divergence (full angle)', F.si(g.fullAngle, 'rad', 5)],
            ['Beam parameter product', `${F.num(g.bpp * 1e6, 5)} mm·mrad`],
            { h: `At z = ${F.si(z, 'm', 4)}` },
            ['Beam radius w(z)', F.si(g.wz, 'm', 5), { main: true }],
            ['Beam diameter 2w(z)', F.si(2 * g.wz, 'm', 5)],
            ['Wavefront radius R(z)', Number.isFinite(g.Rz) ? F.si(g.Rz, 'm', 5) : '∞ (flat)'],
            ['Gouy phase', deg(g.gouy)],
          ];
        }
        const win = L(v.win, u.win), f = L(v.f, u.f);
        pos(win, 'Input radius'); pos(f, 'Focal length');
        const w0 = K.focusWaist({ wIn: win, f, wl: lam, M2: v.M2 });
        const g = K.gaussianBeam({ w0, wl: lam, M2: v.M2 });
        return [
          ['Focused waist radius', F.si(w0, 'm', 5), { main: true }],
          ['Focused spot diameter', F.si(2 * w0, 'm', 5)],
          ['Rayleigh range', F.si(g.zR, 'm', 5)],
          ['Depth of focus 2zR', F.si(g.dof, 'm', 5)],
          ['Focusing NA ≈ w/f', F.num(win / f, 4)],
          ['f-number (f / 2w)', F.num(f / (2 * win), 4)],
          { note: 'Thin lens, collimated input with its waist at the lens, far-field approximation (f ≫ zR).' },
        ];
      },
    },

    // ------------------------------------------------------------------ fiber
    {
      id: 'fiber', name: 'Fiber', glyph: 'NA',
      desc: 'NA, V-number, cutoff, MFD, delay, dispersion',
      inputs: () => [
        { id: 'wl', label: 'Wavelength', value: 1550, units: SPEC, unit: 'nm' },
        { id: 'nco', label: 'Core index', value: 1.4504 },
        { id: 'ncl', label: 'Cladding index', value: 1.4447 },
        { id: 'd', label: 'Core diameter', value: 8.2, units: ['µm', 'mm'], unit: 'µm' },
        { id: 'len', label: 'Fiber length', value: 1, units: ['m', 'km'], unit: 'km' },
        { id: 'ng', label: 'Group index', value: 1.4682 },
        { id: 'D', label: 'Dispersion D', value: 17, unitLabel: 'ps/nm·km' },
        { id: 'bw', label: 'Source linewidth', value: 0.1, units: ['pm', 'nm'], unit: 'nm' },
      ],
      compute(m, v, u) {
        const lam = K.C / K.spectralToHz(v.wl, u.wl);
        pos(lam, 'Wavelength');
        need(v.nco > v.ncl, 'Core index must exceed cladding index');
        const a = L(v.d, u.d) / 2;
        pos(a, 'Core diameter');
        const r = K.fiber({ nCore: v.nco, nClad: v.ncl, coreRadius: a, wl: lam });
        const len = L(v.len, u.len);
        const rows = [
          ['Numerical aperture', F.num(r.NA, 5), { main: true }],
          ['Acceptance half-angle', deg(r.acceptanceHalfAngle)],
          ['V-number', F.num(r.V, 5), { main: true }],
          ['Guidance', r.singleMode ? 'Single-mode' : `Multimode (≈ ${r.approxModes} modes)`],
          ['Single-mode cutoff λc', wl(r.cutoffWl)],
          ['Index contrast Δ', pct(r.deltaRel)],
        ];
        if (r.V > 0.8 && r.V < 2.8) rows.push(['Mode field diameter (Marcuse)', F.si(r.mfd, 'm', 4)]);
        rows.push(
          { h: 'Propagation' },
          ['Group delay', F.si(K.groupDelay(len, v.ng), 's', 5), { main: true }],
          ['Delay per km', F.si(K.groupDelay(1000, v.ng), 's', 5)],
          ['Dispersion broadening', F.si(K.dispersionBroadening(v.D, len / 1000, L(v.bw, u.bw) * 1e9), 's', 4)],
        );
        return rows;
      },
    },
  ];

  window.TOOLS = TOOLS;
})();
