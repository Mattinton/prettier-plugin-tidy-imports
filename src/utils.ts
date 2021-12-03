import { RequiredOptions } from "prettier";
import {
  CommentRange,
  ImportDeclaration,
  Project,
  SourceFile,
  ts,
} from "ts-morph";
import { tsconfigResolverSync } from "tsconfig-resolver";

export type ParserOptions = RequiredOptions;

export type CommentRangeStructure = {
  pos: number;
  end: number;
};

const result = tsconfigResolverSync();
if (!result || !result.exists) throw new Error("Could not find tsconfig.json");

export const tidyImportsProject = new Project({
  resolutionHost: (_host, _options) => ({
    resolveModuleNames: (moduleNames) =>
      moduleNames.map((x) => ({ resolvedFileName: x + ".ts" })),
    getResolvedModuleWithFailedLookupLocationsFromCache: (moduleName) => ({
      resolvedModule: {
        resolvedFileName: moduleName,
        extension: ts.Extension.Ts,
      },
    }),
    resolveTypeReferenceDirectives: (typeDirectiveNames) =>
      typeDirectiveNames.map((x) => ({
        resolvedFileName: x + ".d.ts",
        primary: false,
      })),
  }),
  skipAddingFilesFromTsConfig: true,
  skipLoadingLibFiles: true,
  tsConfigFilePath: result.path,
  skipFileDependencyResolution: true,
});

export function getTidyImportsProject() {
  const result = tsconfigResolverSync();
  if (!result || !result.exists)
    throw new Error("Could not find tsconfig.json");

  return new Project({
    resolutionHost: (_host, _options) => ({
      resolveModuleNames: (moduleNames) =>
        moduleNames.map((x) => ({ resolvedFileName: (x ?? "fix") + ".ts" })),
      getResolvedModuleWithFailedLookupLocationsFromCache: (moduleName) => ({
        resolvedModule: {
          resolvedFileName: moduleName,
          extension: ts.Extension.Ts,
        },
      }),
      resolveTypeReferenceDirectives: (typeDirectiveNames) =>
        typeDirectiveNames.map((x) => ({
          resolvedFileName: (x ?? "fix") + ".d.ts",
          primary: false,
        })),
    }),
    skipAddingFilesFromTsConfig: true,
    skipLoadingLibFiles: true,
    tsConfigFilePath: result.path,
    skipFileDependencyResolution: true,
  });
}

export function isSideEffectImport(node: ImportDeclaration) {
  return (
    !node.getNamespaceImport() &&
    !node.getDefaultImport() &&
    !node.getNamedImports()?.length
  );
}

export function getFilePathDepth(path: string) {
  return path.match(/^[./]+/g)?.[0]?.length ?? 0;
}

export function getImportDeclarations(sourceFile: SourceFile) {
  return sourceFile
    .getImportDeclarations()
    ?.sort((a, b) => a.getPos() - b.getPos());
}

export function getImportDeclarationStructure(node: ImportDeclaration) {
  return {
    isTypeOnly: node.isTypeOnly(),
    defaultImport: node.getDefaultImport()?.getText(),
    namespaceImport: node.getNamespaceImport()?.getText(),
    namedImports: node.getNamedImports()?.map((y) => ({
      name: y.getName(),
      alias: y.getAliasNode()?.getText(),
    })),
    moduleSpecifier: node.getModuleSpecifierValue(),
    leadingTrivia: node
      .getLeadingCommentRanges()
      .map(
        (x) =>
          x.getText() +
          (x.getKind() === ts.SyntaxKind.MultiLineCommentTrivia ? "\n" : "")
      ),
    trailingTrivia: node.getTrailingCommentRanges().map((x) => x.getText()),
  };
}

export function getCommentStructure(
  comment: CommentRange
): CommentRangeStructure {
  return {
    pos: comment.getPos(),
    end: comment.getEnd(),
  };
}
