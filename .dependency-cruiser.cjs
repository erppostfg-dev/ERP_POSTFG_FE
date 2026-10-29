// dependency-cruiser (2026-10-28, Phase 0): import rules for OUR frontend code (Ajay's in-transit screens not checked).
// Known existing violations are in .dependency-cruiser-known-violations.json (baseline); new ones fail `npm run deps`.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', comment: 'A import B import A: load-order bugs.', from: {}, to: { circular: true } },
    { name: 'no-unresolvable', severity: 'error', comment: 'An import that does not resolve.', from: {}, to: { couldNotResolve: true } },
    { name: 'constants-are-leaves', severity: 'error', comment: 'constants/ only import other constants.',
      from: { path: '^src/constants/' }, to: { path: '^src/(pages|components|api|lib|auth)/' } },
    { name: 'not-to-tests', severity: 'error', comment: 'App code must not import test files.', from: { pathNot: '__tests__' }, to: { path: '__tests__' } },
    { name: 'no-dev-only-in-app', severity: 'error', comment: 'Screens must not import src/dev (local previews).',
      from: { path: '^src/(pages|components|api|lib|auth)/', pathNot: '^src/pages/dp/' }, to: { path: '^src/dev/' } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(src/pages/dp/|src/lib/(csvTable|sheet35|snapshotCache|folderFiles))' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
