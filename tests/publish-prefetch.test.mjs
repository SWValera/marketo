import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

async function runtimeSourceFiles(directory, prefix) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...await runtimeSourceFiles(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`));
    } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) {
      files.push({ path: `${prefix}${entry.name}`, url: new URL(entry.name, directory) });
    }
  }
  return files;
}

function parse(path, source) {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function jsxAttribute(node, name) {
  return node.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
}

function attributeExpression(attribute) {
  return attribute?.initializer && ts.isJsxExpression(attribute.initializer)
    ? attribute.initializer.expression
    : undefined;
}

function staticText(value) {
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isTemplateExpression(value)) return value.head.text;
  return null;
}

function attributeText(attribute) {
  if (!attribute?.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  const expression = attributeExpression(attribute);
  return expression ? staticText(expression) : null;
}

function isPublishTarget(value) {
  return value === "/publish" || Boolean(value?.startsWith("/publish?"));
}

function importedLinkName(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement)
      && ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      if (statement.moduleSpecifier.text === "next/link") return statement.importClause?.name?.text ?? null;
      if (statement.moduleSpecifier.text === "@/components/app-link") {
        const binding = statement.importClause?.namedBindings;
        if (binding && ts.isNamedImports(binding)) {
          const imported = binding.elements.find((element) => (element.propertyName ?? element.name).text === "AppLink");
          if (imported) return imported.name.text;
        }
      }
    }
  }
  return null;
}

test("every repository publish Link explicitly disables speculative prefetch", async () => {
  const files = [
    ...await runtimeSourceFiles(new URL("app/", root), "app/"),
    ...await runtimeSourceFiles(new URL("components/", root), "components/"),
    ...await runtimeSourceFiles(new URL("lib/", root), "lib/"),
  ];
  const directByFile = new Map();
  const emptyStateFiles = [];
  const explicitRouterPrefetch = [];

  for (const file of files) {
    const sourceFile = parse(file.path, await readFile(file.url, "utf8"));
    const linkName = importedLinkName(sourceFile);
    visit(sourceFile, (node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)) {
        if (linkName && node.tagName.text === linkName) {
          const href = attributeText(jsxAttribute(node, "href"));
          if (isPublishTarget(href)) {
            const prefetch = attributeExpression(jsxAttribute(node, "prefetch"));
            assert.equal(prefetch?.kind, ts.SyntaxKind.FalseKeyword, `${file.path} must set prefetch={false}`);
            directByFile.set(file.path, (directByFile.get(file.path) ?? 0) + 1);
          }
        }
        if (node.tagName.text === "EmptyState") {
          const href = attributeText(jsxAttribute(node, "actionHref"));
          if (isPublishTarget(href)) {
            const prefetch = attributeExpression(jsxAttribute(node, "actionPrefetch"));
            assert.equal(prefetch?.kind, ts.SyntaxKind.FalseKeyword, `${file.path} EmptyState must opt out`);
            emptyStateFiles.push(file.path);
          }
        }
      }
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === "prefetch"
      ) {
        const target = node.arguments[0] ? staticText(node.arguments[0]) : null;
        if (isPublishTarget(target)) explicitRouterPrefetch.push(file.path);
      }
    });
  }

  assert.deepEqual(Object.fromEntries([...directByFile].sort()), {
    "app/help/page.tsx": 1,
    "app/page.tsx": 1,
    "app/profile/page.tsx": 1,
    "components/header.tsx": 2,
    "components/owner-listing-actions.tsx": 1,
  });
  assert.deepEqual(emptyStateFiles.sort(), [
    "app/profile/page.tsx",
    "components/catalog-client.tsx",
    "components/home-marketplace-tabs.tsx",
  ]);
  assert.deepEqual(explicitRouterPrefetch, []);
});

test("EmptyState keeps prefetch opt-out caller-controlled", async () => {
  const path = "components/empty-state.tsx";
  const source = await readFile(new URL(path, root), "utf8");
  const sourceFile = parse(path, source);
  const linkName = importedLinkName(sourceFile);
  let forwardingFound = false;
  let optionalPropFound = false;
  visit(sourceFile, (node) => {
    if (
      ts.isPropertySignature(node)
      && ts.isIdentifier(node.name)
      && node.name.text === "actionPrefetch"
      && node.questionToken
      && node.type?.kind === ts.SyntaxKind.BooleanKeyword
    ) optionalPropFound = true;
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && ts.isIdentifier(node.tagName)
      && node.tagName.text === linkName
    ) {
      const href = attributeExpression(jsxAttribute(node, "href"));
      const prefetch = attributeExpression(jsxAttribute(node, "prefetch"));
      if (
        href && ts.isIdentifier(href) && href.text === "actionHref"
        && prefetch && ts.isIdentifier(prefetch) && prefetch.text === "actionPrefetch"
      ) forwardingFound = true;
    }
  });
  assert.equal(forwardingFound, true);
  assert.equal(optionalPropFound, true);
});

test("dynamic mobile publish navigation carries the protected flag", async () => {
  const path = "components/mobile-nav.tsx";
  const sourceFile = parse(path, await readFile(new URL(path, root), "utf8"));
  const linkName = importedLinkName(sourceFile);
  let publishEntryFound = false;
  let protectedDynamicLinkFound = false;

  visit(sourceFile, (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const href = node.properties.find(
        (property) => ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === "href",
      );
      const publish = node.properties.find(
        (property) => ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === "publish",
      );
      if (
        href && ts.isPropertyAssignment(href) && isPublishTarget(staticText(href.initializer))
        && publish && ts.isPropertyAssignment(publish) && publish.initializer.kind === ts.SyntaxKind.TrueKeyword
      ) publishEntryFound = true;
    }
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && ts.isIdentifier(node.tagName)
      && node.tagName.text === linkName
    ) {
      const href = attributeExpression(jsxAttribute(node, "href"));
      const prefetch = attributeExpression(jsxAttribute(node, "prefetch"));
      if (
        href && ts.isIdentifier(href) && href.text === "href"
        && prefetch && ts.isConditionalExpression(prefetch)
        && ts.isIdentifier(prefetch.condition) && prefetch.condition.text === "publish"
        && prefetch.whenTrue.kind === ts.SyntaxKind.FalseKeyword
        && ts.isIdentifier(prefetch.whenFalse) && prefetch.whenFalse.text === "undefined"
      ) protectedDynamicLinkFound = true;
    }
  });

  assert.equal(publishEntryFound, true);
  assert.equal(protectedDynamicLinkFound, true);
});
