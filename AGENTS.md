# Snap2Sell development boundaries

- Read README.md and docs/CONTRIBUTING.md before edits.
- `app/` only owns framework routing and composition. Product rules belong in `packages/`.
- `apps/web` never imports `apps/api`, server credentials, database helpers, or BigGo HTTP adapter.
- Domain packages never import application source. Shared schemas live in `packages/contracts`.
- Keep factual fields separate from preference fields; never infer a factual claim from style.
- Preserve user isolation in every SQL query and image access. No frontend API keys.
- Keep migrations append-only after deployment.
- Run `npm run typecheck` and relevant `npm test` coverage after changes. HTTP checks are localhost-only and create disposable test data.
- No proactive sub-agent delegation is required by this file.
