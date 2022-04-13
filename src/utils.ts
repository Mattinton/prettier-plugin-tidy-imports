import naturalSort from "natural-sort";
import { RequiredOptions } from "prettier";
import {
  CommentRange,
  ImportDeclaration,
  ImportDeclarationStructure,
  OptionalKind,
  Project,
  ts,
} from "ts-morph";

export type ParserOptions = RequiredOptions;

export type CommentRangeStructure = {
  pos: number;
  end: number;
};

export const sorter = naturalSort();

export function getTidyImportsProject() {
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

export function sortImportDeclarationsByPos(
  a: ImportDeclaration,
  b: ImportDeclaration
) {
  return a.getPos() - b.getPos();
}

export function getImportDeclarationStructure(
  node: ImportDeclaration
): OptionalKind<ImportDeclarationStructure> {
  return {
    isTypeOnly: node.isTypeOnly(),
    defaultImport: node.getDefaultImport()?.getText(),
    namespaceImport: node.getNamespaceImport()?.getText(),
    namedImports: node
      .getNamedImports()
      ?.map((y) => ({
        name: y.getName(),
        alias: y.getAliasNode()?.getText(),
        isTypeOnly: y.isTypeOnly(),
      }))
      .sort((a, b) => sorter(a.name, b.name)),
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
