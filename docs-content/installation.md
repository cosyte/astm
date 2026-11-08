---
id: installation
title: Installation
description: "Install @cosyte/astm, meet the Node.js prerequisite, and confirm the package resolves from ESM or CommonJS."
sidebar_position: 1
---

# Installation

`@cosyte/astm` is a zero-dependency TypeScript package for Node.js. It ships dual **ESM + CJS** builds with
per-condition type declarations, so it works from either module system without configuration.

> **Status:** published on npm, and the public API is settled and stable: the exported names,
> options, return shapes, and warning codes are the surface a release keeps, and a breaking change
> bumps the minor version with its migration in the changelog. Two surfaces are still moving, both
> additively: the built-in profile registry and the warning and error code sets.

## Prerequisites

- **Node.js 22 or later, tested on 22, 24, and 26** (the whole `@cosyte/*` suite targets ES2023).
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
