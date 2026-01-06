# Pre-commit Hooks Setup Guide

This project uses pre-commit hooks to enforce code quality standards before commits.

## Overview

- **Backend (Python)**: Uses `pre-commit` framework with black, isort, flake8, mypy, bandit
- **Frontend (TypeScript/React)**: Uses `husky` + `lint-staged` with ESLint and Prettier

---

## Backend Setup (Python)

### 1. Install pre-commit

```bash
# Install globally (recommended)
pip install pre-commit

# Or in virtual environment
cd /home/kishank/impact-database
source fresh_venv/bin/activate
pip install pre-commit
```

### 2. Install hooks

```bash
# From project root
cd /home/kishank/impact-database
pre-commit install
```

### 3. Test hooks

```bash
# Run on all files (first time only)
pre-commit run --all-files

# Or commit to trigger hooks
git add .
git commit -m "test: pre-commit hooks"
```

### Hooks Included

| Hook | Purpose | Configuration |
|------|---------|---------------|
| **black** | Code formatting | Line length: 100 |
| **isort** | Import sorting | Profile: black |
| **flake8** | Linting | Max line: 100, ignore E203/W503 |
| **mypy** | Type checking | Ignore missing imports |
| **bandit** | Security scanning | Config: `.bandit.yaml` |
| **trailing-whitespace** | Remove trailing spaces | - |
| **check-yaml** | Validate YAML files | - |
| **check-json** | Validate JSON files | - |
| **detect-private-key** | Security: no private keys | - |

### Configuration Files

- `.pre-commit-config.yaml` - Main configuration
- `.bandit.yaml` - Security check settings

---

## Frontend Setup (TypeScript/React)

### 1. Install dependencies

```bash
cd frontend
npm install
# This automatically runs 'npm run prepare' to setup husky
```

### 2. Verify installation

```bash
# Check if .husky/pre-commit exists
ls -la .husky/pre-commit

# Make executable if needed
chmod +x .husky/pre-commit
```

### 3. Test hooks

```bash
# Stage some files
git add src/app/upload/page.tsx

# Commit to trigger lint-staged
git commit -m "test: husky hooks"
```

### Hooks Included

| Hook | Purpose | Files |
|------|---------|-------|
| **ESLint** | Fix linting errors | `*.ts`, `*.tsx` |
| **Prettier** | Format code | `*.ts`, `*.tsx`, `*.json`, `*.md`, `*.css` |

### Configuration Files

- `frontend/package.json` - lint-staged config
- `frontend/.eslintrc.json` - ESLint rules
- `frontend/.prettierrc` - Prettier rules

---

## Usage

### Normal Workflow

Pre-commit hooks run automatically on `git commit`:

```bash
# 1. Stage your changes
git add .

# 2. Commit (hooks run automatically)
git commit -m "feat: add new feature"

# If hooks fail, fix issues and try again
git add .
git commit -m "feat: add new feature"
```

### Bypass Hooks (Emergency Only)

```bash
# Skip hooks (not recommended)
git commit --no-verify -m "emergency fix"
```

### Run Hooks Manually

```bash
# Backend - run on all files
pre-commit run --all-files

# Backend - run specific hook
pre-commit run black --all-files

# Frontend - run lint-staged
cd frontend
npx lint-staged
```

---

## Troubleshooting

### Backend: "pre-commit: command not found"

```bash
# Install pre-commit
pip install pre-commit

# Or add to PATH
export PATH="$HOME/.local/bin:$PATH"
```

### Backend: Hooks not running

```bash
# Reinstall hooks
pre-commit uninstall
pre-commit install

# Check installation
pre-commit --version
```

### Frontend: "husky: command not found"

```bash
cd frontend
npm install husky --save-dev
npm run prepare
```

### Frontend: Permission denied

```bash
chmod +x frontend/.husky/pre-commit
```

### Black formatting conflicts

If black reformats code differently than your editor:

```bash
# Install black in your IDE
# VS Code: Install "Black Formatter" extension
# Set line length to 100 in settings
```

---

## CI/CD Integration

These hooks also run in CI/CD pipelines:

```yaml
# .github/workflows/ci.yml
- name: Run pre-commit
  run: pre-commit run --all-files

- name: Run frontend linting
  run: |
    cd frontend
    npm run lint
```

---

## Customization

### Add new backend hook

Edit `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/pycqa/pylint
    rev: v3.0.0
    hooks:
      - id: pylint
        files: ^app/
```

Then update hooks:

```bash
pre-commit install --install-hooks
```

### Add new frontend hook

Edit `frontend/package.json`:

```json
"lint-staged": {
  "*.{ts,tsx}": [
    "eslint --fix",
    "prettier --write",
    "tsc --noEmit"  // Add type checking
  ]
}
```

---

## Performance Tips

1. **Backend**: Pre-commit caches results, so subsequent runs are faster
2. **Frontend**: lint-staged only runs on staged files (fast)
3. **Skip hooks during WIP commits**: Use `--no-verify` sparingly

---

## Best Practices

✅ **DO**:
- Run `pre-commit run --all-files` after installing
- Commit frequently with hooks enabled
- Fix issues immediately when hooks fail

❌ **DON'T**:
- Don't use `--no-verify` regularly
- Don't disable hooks globally
- Don't commit without running hooks

---

## Additional Resources

- [pre-commit documentation](https://pre-commit.com/)
- [Husky documentation](https://typicode.github.io/husky/)
- [lint-staged documentation](https://github.com/okonet/lint-staged)

---

*Setup Complete! Your commits will now be automatically checked for quality issues.*
