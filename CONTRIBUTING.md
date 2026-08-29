# Contributing to EB Bot

## Setup

```bash
git clone https://github.com/EhabYT/Discord-v1.git
cd Discord-v1
cp .env.example .env
npm ci
npm run build:dashboard
```

## Development

```bash
npm run dev          # Start bot + backend with hot reload
npm --prefix dashboard run dev  # Start dashboard dev server
```

## Running Tests

```bash
npm test                # Unit + Security tests
npm run test:unit       # Unit tests only
npm run test:security   # Security tests only
npm run lint            # ESLint
npm run lint:gate       # Lint budget gate (CI)
```

## Release Process

```bash
npm run verify   # Full release gate: validate, lint, test, audit, build
```

## Guidelines

- Follow the existing code style and ESLint configuration
- Never commit secrets or `.env` files
- Update documentation when adding new features
- Ensure all tests pass before submitting