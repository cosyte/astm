---
id: installation
title: Installation
sidebar_label: Installation
description: "Install @cosyte/astm, meet the Node.js prerequisite, and confirm the package resolves from ESM or CommonJS."
---

# Installation

`@cosyte/astm` is a TypeScript package for Node.js with no runtime dependencies. It ships ESM and
CommonJS builds, each with its own type declarations, so it works from either module system without
configuration.

> **Status:** published on npm, and the public API is settled and stable: the exported names,
> options, return shapes, and warning codes are the surface a release keeps, and a breaking change
> bumps the minor version with its migration in the changelog. Two surfaces are still moving, both
> additively: the built-in profile registry and the warning and error code sets.

## Prerequisites

- **Node.js 22 or later.** CI tests it on Node.js 22, 24 and 26.
- A package manager: `npm`, `pnpm` or `yarn`.

## Install

```bash
npm install @cosyte/astm
```

## Check the install

Import the package and print its version:

```ts runnable
import { VERSION } from "@cosyte/astm";

console.log(VERSION);
typeof VERSION; // => "string"
```

The same import works from CommonJS:

```js no-run a CommonJS module, which the sample runner does not load
const { VERSION } = require("@cosyte/astm");

console.log(VERSION);
```

If either prints a version string, the install is good. Go on to the [Quickstart](./quickstart.md).
