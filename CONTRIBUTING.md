# Contributing

Thank you for improving the Impact Database. This guide covers workflows, code style, and pull request expectations.

## Getting Started
- Fork the repo or create a feature branch from `main`.
- Use the provided tooling:
  - Frontend: `npm install` inside `frontend/` (hooks via Husky + lint-staged).
  - Backend: `pip install -r app/requirements.txt` (Python hooks via `fresh_venv/bin/pre-commit`).
- Run services locally with `./docker-start.sh --dev` when possible to validate end-to-end behavior.

## Code Style
- **Frontend**: TypeScript, ESLint + Prettier, React 18/Next.js 16 conventions. Prefer functional components and hooks; keep UI pure and data fetching in hooks.
- **Backend**: FastAPI with type hints, pydantic models, and structured logging (`structlog`). Favor dependency injection via FastAPI `Depends`.
- **Testing**: Jest/Playwright for frontend; pytest for backend. Add/extend tests alongside features and fixes.
- **Security & Observability**: Avoid plaintext secrets, keep logging structured, and prefer returning typed error responses.

## Pull Request Checklist
- [ ] Feature/bugfix has relevant tests (unit or integration).
 - [ ] Lint/formatting passes (`npm run lint` or `npx lint-staged`; `fresh_venv/bin/pre-commit run --all-files`).
 - [ ] No new console.log statements; use toasts or structured logs.
 - [ ] Updated docs where behavior or configuration changed.
 - [ ] Backward compatibility considered (API contracts, env vars, migrations).
 - [ ] Screenshots or curl examples for UI/API changes when helpful.

## Branching & Commits
- Branch naming: `feat/<topic>`, `fix/<issue>`, or `chore/<task>`.
- Commits should be scoped and descriptive (e.g., `feat: add upload retry banner`).
- Rebase onto `main` before opening/merging to keep history clean.

## Review Process
- Open a PR early as draft for feedback.
- Fill the PR description with context, testing performed, and rollout notes.
- At least one reviewer approval required; security-sensitive changes may need an additional reviewer.
- Address review comments promptly; prefer follow-up commits over force-push until final squash (if the team squashes).
- Merging: maintainers handle merges; ensure CI (if present) is green.

## Issue Reporting
- Include steps to reproduce, expected vs actual behavior, logs/screenshots, and environment details (commit, OS, Docker vs host).
- Tag security/privacy issues clearly and avoid posting secrets in tickets or PRs.

## Release Notes
- Flag breaking changes in PRs and summarize key impacts (API shape, env vars, migrations).
- Update changelog or release summary documents when applicable.
