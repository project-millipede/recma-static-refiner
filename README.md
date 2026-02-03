# recma-static-refiner

> Build-time validation, derivation, and pruning for MDX props

A **compile-time** Unified/Recma plugin that moves MDX prop processing from runtime to build time—validating, transforming, and pruning props during static bundling.

## Features

- **🛡️ Build-Time Validation:** Enforce schemas via Standard Schema V1 (Zod, Valibot, ArkType) at compile time; no validation code ships to the client.
- **⚡ Pre-Computed Derivation:** Complex calculations happen at build time; results are baked in as literals.
- **✂️ Dead Prop Elimination:** Source-only props are stripped from the emitted code, reducing bundle size.
- **✨ Zero Client-Side Cost:** No plugin code, validators, or derivation logic executes in the browser.
- **🔒 Type-Safe Registry:** Full TypeScript inference with strict contracts on prop shapes and derived values.

## Why Build-Time Processing?

By default, MDX components receive props as-is and handle them at runtime—validation, derivation, and cleanup all happen in the browser. This plugin provides an **escape hatch to compile time**: move that work to the build step and ship only the results.

### When You Move Work to Build Time

| Aspect           | Runtime (Default)               | Build Time (This Plugin)                                    |
| ---------------- | ------------------------------- | ----------------------------------------------------------- |
| **Validation**   | Schemas execute on every render | Schemas execute once at build; zero validation code shipped |
| **Derivation**   | Calculations run in the browser | Values pre-computed; results baked as static literals       |
| **Data cleanup** | Source props travel to client   | Internal props stripped; smaller bundles                    |
| **Type safety**  | Runtime checks or manual        | Schema-guaranteed; full TypeScript inference                |

### When Dynamicity Remains

Not all props are statically extractable. Runtime expressions (variables, function calls, JSX) are **preserved verbatim** and passed through to the component. The plugin processes what it can statically; the rest remains dynamic.

## Static Data Processing Pipeline

At build time, the plugin extracts **statically determinable data** and runs it through three phases:

| Phase             | Input              | Output                      | Purpose                                             |
| ----------------- | ------------------ | --------------------------- | --------------------------------------------------- |
| **1. Validation** | Raw props from MDX | Validated/transformed props | Enforce contracts using Zod/Valibot/ArkType         |
| **2. Derivation** | Validated props    | Props + computed values     | Pre-calculate derived data (normalization, layouts) |
| **3. Pruning**    | Full prop set      | Cleaned prop set            | Strip source-only data before emission              |

The result: your runtime components receive plain, static objects with all processing already complete.

## Installation

```bash
npm install recma-static-refiner
# or
pnpm add recma-static-refiner
```

## Examples

### Simple Prop Transformation (Optional)

Transform a string prop to a number:

```typescript
const rules = defineRuleRegistry({
  Counter: defineRule<{ initial: number }>()({
    schema: z.object({ initial: z.coerce.number() })
  })
});
```

```mdx
<Counter initial="5" />
```

Output: `<Counter initial={5} />`

> For simple cases like this, you don't need this plugin—write `<Counter initial={5} />` directly instead.

### Real-World: Meta Props (Essential)

Where this plugin becomes essential: processing **meta props** from CodeHike or remark plugins, where values are extracted as strings:

```mdx
<PostList>
  # !!posts
  !author "42"
  !createdAt "2020-01-01T10:00:00Z"
  !contentType "article"
  ## !content
  ### !text
  Hello world
</PostList>
```

```typescript
type PostListProps = {
  posts: {
    author: number;
    createdAt: Date;
    contentType: string;
  }[];
};

const rules = defineRuleRegistry({
  PostList: defineRule<PostListProps>()({
    schema: z.object({
      posts: z.array(
        z.object({
          author: z.coerce.number(), // "42" → 42
          createdAt: z.iso.datetime(), // string → Date
          contentType: z.string()
        })
      )
    }),
    derive: (input, set) => {
      set({ postCount: input.posts.length }); // Pre-computed at build
    }
  })
});
```

## How to Use

> **Important:** This plugin requires **two configuration steps**: First define your component rules, then register the plugin with your MDX compiler.

### Step 1: Define Rules

Create a rule registry that maps component names to their validation, derivation, and pruning configuration:

```typescript
import { defineRuleRegistry, defineRule } from 'recma-static-refiner';
import { z } from 'zod';

// 1. Define your component's props interface
type CustomComponentProps = {
  title: string;
  count: number;
  _sourceId: string;
  doubledCount?: number; // Set by derive
};

// 2. Create a validation schema using Standard Schema V1 (Zod, Valibot, or ArkType)
// Explicit transform: MDX passes props as strings, schema converts to expected types
const CountSchema = z.codec(
  z.union([z.string(), z.number()]), // input: accept string or number
  z.number(), // output: always number
  {
    decode: raw => {
      // "42" → 42
      return typeof raw === 'string' ? parseInt(raw, 10) : raw;
    },
    encode: val => val
  }
);

const CustomComponentSchema = z.object({
  title: z.string(),
  count: CountSchema,
  _sourceId: z.string()
});

// 3. Build your rule registry
export const staticRefinerRules = defineRuleRegistry({
  CustomComponent: defineRule<CustomComponentProps>()({
    // Schema validates and transforms props at build time
    schema: CustomComponentSchema,

    // Derive computes new props based on the upstream input
    derive: (derivationInput, set) => {
      // derivationInput is InferOutput<S, Props>:
      // - With schema: SchemaValidatedProps<S> (validated/transformed output)
      // - Without schema: PassthroughProps<Props> (direct pass-through)
      //
      // Schema transformed "42" → 42, so derivationInput.count is number
      // Compute derived value using the validated number
      set({
        doubledCount: derivationInput.count * 2
        // TypeScript ensures only CustomComponentProps keys are allowed here
      });
    },

    // PruneKeys removes props after derivation (no longer needed at runtime)
    pruneKeys: ['title', 'count']
  }),

  // Add more component rules as needed
  AnotherComponent: defineRule<AnotherComponentProps>()({
    schema: AnotherComponentSchema
    // Schema-only rule: validates but doesn't derive or prune
  })
});
```

### Step 2: Register Plugin

Pass your rule registry to the plugin in your MDX compilation configuration:

#### Option A: Using `@mdx-js/mdx` directly

```typescript
import { compile } from '@mdx-js/mdx';
import { recmaStaticRefiner } from 'recma-static-refiner';
import { staticRefinerRules } from './your-rules-file';

const mdxOptions = {
  recmaPlugins: [
    // Register recmaStaticRefiner with your rules
    [recmaStaticRefiner, { rules: staticRefinerRules }]
  ]
};

const compiled = await compile(mdxSource, mdxOptions);
```

#### Option B: Using Next.js with `@next/mdx`

```typescript
// next.config.js
import { recmaStaticRefiner } from 'recma-static-refiner';
import { staticRefinerRules } from './your-rules-file';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx']
};

const withMdx = require('@next/mdx')({
  options: {
    recmaPlugins: [[recmaStaticRefiner, { rules: staticRefinerRules }]]
  }
});

export default withMdx(nextConfig);
```

### Example: MDX Source → Compiled Output

Given this MDX:

```mdx
<CustomComponent title="Hello World" count="42" _sourceId="internal-123" />
```

With the rule defined above, the plugin will:

1. **Validate:** Ensure `title` is a string and transform `count` to a number
2. **Derive:** Compute `doubledCount` as `count * 2`
3. **Prune:** Remove `title`, `count`, and `_sourceId` from the runtime output
4. **Output:** The compiled component receives only `{ doubledCount: 84 }`

## Configuration Reference

### Plugin Options

| Option            | Type                | Default        | Description                                                                                                                                         |
| ----------------- | ------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules`           | `RuleMap`           | Required       | Registry mapping component names to their validation, derivation, and pruning rules                                                                 |
| `applyTransforms` | `boolean`           | `true`         | Whether to write validated values back to the AST. `true` updates the AST (e.g., `"50"` → `50`); `false` validates without modifying (dry-run mode) |
| `preservedKeys`   | `readonly string[]` | `['children']` | Props to preserve as dynamic expressions. These are not resolved to static data and skip transformation                                             |

### Rule Features

Each rule can configure three pipeline phases. **All features are optional**, but at least one must be defined per rule:

| Feature     | Purpose                                              | When to Use                                |
| ----------- | ---------------------------------------------------- | ------------------------------------------ |
| `schema`    | Validates and transforms props using Standard Schema | Ensure props conform to expected types     |
| `derive`    | Computes derived props from upstream input           | Build computed state from validated props  |
| `pruneKeys` | Removes source-only props from runtime output        | Strip internal data used only during build |

### Derive Function Input Types

The `derive` function receives `derivationInput: InferOutput<S, Props>`. The type resolves based on schema presence:

```
InferOutput<S, Props> resolves to:

┌─────────────────────────────────────┐
│  S extends StandardSchemaV1 ?       │
│    ├── SchemaValidatedProps<S>      │  ← With Schema (strict)
│    └── PassthroughProps<Props>      │  ← Without Schema (partial)
└─────────────────────────────────────┘
```

| Aspect             | With Schema                        | Without Schema                     |
| ------------------ | ---------------------------------- | ---------------------------------- |
| **Resolved Type**  | `SchemaValidatedProps<S>`          | `PassthroughProps<Props>`          |
| **Runtime Value**  | Schema's `decode` output           | Props as provided at instantiation |
| **Completeness**   | Guaranteed (schema enforces shape) | Props as provided                  |
| **Transformation** | Applied (`"42"` → `42`)            | None (raw values)                  |
| **Type Safety**    | Schema output shape                | Props interface, all optional      |

**With Schema:**

```typescript
// derivationInput: SchemaValidatedProps<typeof CustomComponentSchema>
derive: (derivationInput, set) => {
  // Schema's decode already ran: "42" → 42
  // TypeScript knows derivationInput.count is number
  set({ computed: derivationInput.count * 2 });
};
```

**Without Schema (Passthrough Mode):**

```typescript
// Without Schema: Direct props pass-through
// derivationInput: PassthroughProps<Props>
derive: (derivationInput, set) => {
  // Access props directly as provided at instantiation
  set({
    summary: `${derivationInput.title} (${derivationInput.count} items)`
  });
};
```

> ⚠️ **Placeholder required:** `derive` can only set props that exist in the AST (leaf-only patching). Add placeholder props in your MDX before setting them:
>
> ```mdx
> <CustomComponent doubledCount={null} />
> ```

### Feature Combinations

Rules can mix features to suit your needs:

```typescript
// Validation + Derivation + Pruning
FullComponent: defineRule<Props>()({
  schema: MySchema,
  derive: (input, set) => set({ computed: transform(input) }),
  pruneKeys: ['sourceData'],
}),

// Validation only
ValidatedComponent: defineRule<Props>()({
  schema: MySchema,
}),

// Derivation only (passthrough mode)
ComputedComponent: defineRule<Props>()({
  derive: (input, set) => set({ computed: calculate(input) }),
}),

// Pruning only
CleanComponent: defineRule<Props>()({
  pruneKeys: ['internalId', 'debug'],
}),
```

| Combination                          | When to Use                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| **Full** (validate + derive + prune) | Maximum control—transform inputs, compute derived state, strip internal data |
| **Validate only**                    | Type safety and transformation without derivation or cleanup                 |
| **Derive only**                      | Trusted inputs that need computed values based on static props               |
| **Prune only**                       | Clean up props from external sources without validation or derivation        |

### Error Handling

The plugin throws **build-time errors** for any validation or patch failure. It enforces a zero-tolerance policy: any unapplied patch aborts compilation.

| Failure Type          | Cause                                        | Resolution                              |
| --------------------- | -------------------------------------------- | --------------------------------------- |
| **Schema validation** | Prop doesn't match schema                    | Fix the invalid value in MDX            |
| **Derive patch**      | Target prop missing from AST                 | Add placeholder in MDX: `prop={null}`   |
| **Structural patch**  | Dynamic keys, spreads, or preserved subtrees | Requires component architecture changes |

> Build errors include phase annotations and summaries. Derive failures provide actionable hints; structural failures indicate non-recoverable AST constraints.

## Capabilities

| Capability             | Supported    | Notes                                                 |
| ---------------------- | ------------ | ----------------------------------------------------- |
| Static literal props   | ✅ Yes       | Strings, numbers, booleans, null                      |
| Static arrays/objects  | ✅ Yes       | Without spreads or computed keys                      |
| Schema validation      | ✅ Yes       | Zod, Valibot, ArkType at build time                   |
| Prop transformation    | ✅ Yes       | `"42"` → `42` via schema                              |
| Derived prop injection | ✅ Yes       | Computed at build, emitted as literals                |
| Prop removal           | ✅ Yes       | Source-only keys stripped from output                 |
| Dynamic expressions    | ⚠️ Preserved | Passed through unchanged (see `preservedKeys`)        |
| Runtime values         | ❌ No        | Variables, function calls, member access not resolved |

See [`src/architecture.ts`](./src/architecture.ts) for:

- Expression extraction and preservation
- AST patching constraints
