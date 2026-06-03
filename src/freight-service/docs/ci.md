# CI Pipeline Configuration Spec

This document details the configuration for the automated CI/CD pipeline verifying builds, tests, migrations, and containerization.

## 🛠️ GitHub Actions Workflow Schema

Below is the workflow specification (`.github/workflows/ci.yml`):

```yaml
name: Neuromail Freight CI

on:
  push:
    branches: [ main, dev ]
  pull_request:
    branches: [ main ]

jobs:
  lint-and-format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test:unit

  db-migration-smoke-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: password
          POSTGRES_DB: neuromail_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - name: Run Migrations UP
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/neuromail_test
        run: npm run migrate:up
      - name: Run Migrations DOWN
        env:
          DATABASE_URL: postgresql://postgres:password@localhost:5432/neuromail_test
        run: npm run migrate:down
```
