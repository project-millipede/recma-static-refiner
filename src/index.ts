import type { Plugin, Transformer } from 'unified';
import type { Program } from 'estree';
import { is, traverse } from 'estree-toolkit';

import type { PluginOptions } from './types';
import { createComponentResolver } from './jsx-callsite-resolver';
import { createScopedVisitor } from './visitor';
export { defineRule, defineRuleRegistry } from './types';

export const recmaStaticRefiner: Plugin<[PluginOptions], Program> = options => {
  // 1. Create the callsite resolver.
  //    Contract: returns a `ComponentMatch` for supported JSX runtime callsites
  //    that target a registered component; otherwise returns `null`.
  const resolveComponentMatch = createComponentResolver(options.rules);

  // 2. Create the scoped AST visitor.
  //    The visitor uses `resolveComponentMatch` to decide whether a given
  //    CallExpression should be processed; non-matches are skipped.
  const visitor = createScopedVisitor(resolveComponentMatch, options);

  // 3. Return the unified transformer.
  const transformer: Transformer<Program> = tree => {
    if (!is.program(tree)) return;
    traverse(tree, visitor);
  };

  return transformer;
};
