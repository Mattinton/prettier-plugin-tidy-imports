import { clone } from "lodash";
import naturalSort from "natural-sort";
import path from "path";
import { RequiredOptions } from "prettier";
import {
  CommentRange,
  ImportDeclaration,
  ImportDeclarationStructure,
  OptionalKind,
  Project,
  SourceFile,
  ts,
} from "ts-morph";
import { tsconfigResolverSync } from "tsconfig-resolver";

type ParserOptions = RequiredOptions;

const result = tsconfigResolverSync();
if (!result || !result.exists) throw new Error("Could not find tsconfig.json");

const project = new Project({
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

console.log(project.compilerOptions);

const sorter = naturalSort();

export function preprocess(code: string, options: ParserOptions) {
  const sourceFile = project.createSourceFile(
    `fix${path.parse(options.filepath).ext}`,
    code,
    {
      overwrite: true,
    }
  );

  if (!sourceFile.getImportDeclarations().length) return code;

  const topCommentsRange = getSortedImportDeclarations(sourceFile)[0]
    .getLeadingCommentRanges()
    .reduce(
      (acc, node) => {
        if (node.getPos() < acc.pos) return { ...acc, pos: node.getPos() };
        if (node.getEnd() > acc.end) return { ...acc, end: node.getEnd() };
        return acc;
      },
      { pos: 0, end: 0 }
    );

  sourceFile.organizeImports({}, {});

  const imports = getSortedImportDeclarations(sourceFile);
  if (!imports.length) return code;

  const importsData = imports.map(
    (x, i): OptionalKind<ImportDeclarationStructure> => {
      const namedImports = x.getNamedImports();
      namedImports.sort((a, b) => {
        const aSort = a.getAliasNode()?.getText() ?? a.getName();
        const bSort = b.getAliasNode()?.getText() ?? b.getName();
        return sorter(aSort, bSort);
      });

      return {
        isTypeOnly: x.isTypeOnly(),
        defaultImport: x.getDefaultImport()?.getText(),
        namespaceImport: x.getNamespaceImport()?.getText(),
        namedImports: namedImports.map((y) => ({
          name: y.getName(),
          alias: y.getAliasNode()?.getText(),
        })),
        moduleSpecifier: x.getModuleSpecifierValue(),
        leadingTrivia: x
          .getLeadingCommentRanges()
          .filter((x) => x.getPos() > topCommentsRange.end)
          .map((x) => x.getText()),
        trailingTrivia: x.getTrailingCommentRanges().map((x) => x.getText()),
      };
    }
  );

  const commentsToRemove = imports.reduce<{ pos: number; end: number }[]>(
    (acc, node) => {
      const text = { text: node.getText(), pos: node.getPos() };
      return [
        ...acc,
        ...node
          .getLeadingCommentRanges()
          .filter((x) => x.getPos() > topCommentsRange.end)
          .map((x) => ({
            text: x.getText(),
            pos: x.getPos(),
            end: x.getEnd(),
          })),
      ];
    },
    []
  );

  commentsToRemove.reverse().forEach((comment) => {
    sourceFile.removeText(comment.pos, comment.end);
  });

  sourceFile.getImportDeclarations().forEach((node) => node.remove());

  const groupedImports = importsData.reduce<
    OptionalKind<ImportDeclarationStructure>[][]
  >(
    (acc, node) => {
      const [sideEffect, namespace, thirdParty, relative] = acc;
      if (!!node.namespaceImport) {
        namespace.push(node);
      } else if (!!node.moduleSpecifier.match(/^[./]+/)) {
        relative.push(node);
      } else if (!!node.defaultImport || !!node.namedImports?.length) {
        thirdParty.push(node);
      } else {
        sideEffect.push(node);
      }
      return acc;
    },
    [[], [], [], []]
  );

  const finalImports: OptionalKind<ImportDeclarationStructure>[] =
    groupedImports.reduce((acc, group) => {
      group.sort((a, b) => {
        const aName = a.moduleSpecifier;
        const bName = b.moduleSpecifier;

        const defaultDiff = +!!b.defaultImport - +!!a.defaultImport;
        if (defaultDiff !== 0) return defaultDiff;

        const depthDiff = filePathDepth(aName) - filePathDepth(bName);
        if (depthDiff !== 0) {
          return depthDiff / Math.abs(depthDiff);
        }

        return sorter(aName, bName);
      });

      return [...acc, ...group];
    }, []);

  sourceFile.insertImportDeclarations(
    sourceFile.getLineAndColumnAtPos(topCommentsRange.end).line - 1,
    finalImports
  );

  return sourceFile.getFullText();
}

function filePathDepth(path: string) {
  return path.match(/^[./]+/g)?.[0]?.length ?? 0;
}

function getSortedImportDeclarations(sourceFile: SourceFile) {
  return sourceFile
    .getImportDeclarations()
    ?.sort((a, b) => a.getPos() - b.getPos());
}
