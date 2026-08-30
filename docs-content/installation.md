---
id: installation
title: Installation
sidebar_position: 1
---

# Installation

`@cosyte/astm` is a zero-dependency TypeScript package for Node.js. It ships dual **ESM + CJS** builds with
per-condition type declarations, so it works from either module system without configuration.

> **Status:** published on npm, on a pre-release ladder: the public API is **not yet stable**. The
> exported names, options and warning codes can still change from one release to the next, so pin
> the version you install rather than tracking the latest.

## Prerequisites

- **Node.js >= 22** (the whole `@cosyte/*` suite targets ES2023 / Node 22+).
- A package manager: `pnpm`, `npm`, or `yarn`.

## Install

```bash
npm install @cosyte/astm
```

## Smoke test

Confirm the package resolves and its version symbol is present:

```ts
import { VERSION } from "@cosyte/astm";

console.log(VERSION);
```

If that prints a version string, the install is good: head to the [Quickstart](./quickstart).
