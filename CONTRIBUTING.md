# Contributing to OptiTray

Thanks for helping. Bug reports, formula corrections and new optics tools are all welcome.

By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md). Report security problems privately as
described in [SECURITY.md](SECURITY.md), not in public issues.

## Reporting bugs and requesting features

Use the issue templates. For a wrong result, please give the tool, the inputs and units, what OptiTray showed, and the
value you expected with its source (a formula, textbook or datasheet).

## Development setup

You need Windows 10/11 and Node.js 22.12 or newer.

```bash
cd optitray-source
npm ci
npx install-electron --no   # once: downloads the Electron runtime for `npm start`
npm start
npm test
```

`npm run dist` builds the portable zip (and the installer if NSIS is installed). See
[optitray-source/README.md](optitray-source/README.md) for the code layout.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep each pull request to one change.
3. Add or update tests in `optitray-source/test/` for any change to `src/calc.js`. `npm test` must pass.
4. Put physics in `src/calc.js` (pure functions, SI units) and UI in `src/renderer/tools.js`.
5. Update the README if you add a tool or change behaviour.

### Ground rules

These keep the app safe and small, and pull requests that break them will not be merged:

- **No network access.** The app must stay fully offline: no telemetry, update checks, CDNs or web fonts.
- **No new dependencies without discussion.** There are no runtime npm packages and only four pinned build
  dependencies. Open an issue first if you think one is needed. Any new dependency must be exact-pinned, have no
  install scripts, use a GPL-compatible license and pass `npm audit`.
- **Keep the renderer locked down.** Leave `sandbox`, `contextIsolation`, the Content-Security-Policy and the IPC
  sender checks in place, and build the DOM with `textContent` / `createElement`, never `innerHTML`.

## License

OptiTray is licensed under the [GNU General Public License v3.0](LICENSE). By submitting a contribution you agree
that it is licensed under the same terms.
