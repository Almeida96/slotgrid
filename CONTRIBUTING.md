# Contributing

Use Node.js 22+ and pnpm 11.25.0. Install dependencies with `pnpm install --frozen-lockfile`.

Run `pnpm run check`, `pnpm run build`, and `pnpm test` before opening a pull request. For interaction changes, also test the demo in a browser with a mouse and keyboard. Check narrow layouts and touch behavior when changing the grid layout.

Keep schedule rules in `src/model.ts` and editor behavior in `src/slot-grid.ts`. Add a regression test for a bug fix. The demo lives in `demo/`; it is separate from the component API.

Bug reports should include browser/version, steps to reproduce, and a small example schedule. Use fictional availability when sharing examples.
