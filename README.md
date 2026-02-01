# recma-static-refiner

A robust **Unified/Recma** plugin for validating, transforming, and pruning MDX props at **build time**.

It allows you to enforce strict TypeScript contracts on your MDX components, derive complex data from simple props, and clean up the final output—all before the code reaches the browser.

## Features

- **🛡️ Build-time Validation:** Enforce schemas (Zod, Valibot, ArkType) on props passed in MDX.
- **⚡ Computed Props (`derive`):** Generate complex runtime data (e.g., loading file contents, calculating layouts) based on static props.
- **✂️ Pruning:** Automatically remove "Source-Only" props that shouldn't leak to the runtime bundle.
- **✨ Zero Runtime Overhead:** All transformations happen during the AST compilation phase.
- **🔒 Type Safety:** First-class TypeScript inference for your rule registry.

## Installation

```bash
npm install recma-static-refiner
# or
pnpm add recma-static-refiner
```
