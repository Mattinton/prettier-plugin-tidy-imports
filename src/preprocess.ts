import naturalSort from "natural-sort";
import path from "path";
import { RequiredOptions } from "prettier";
import {
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

const sorter = naturalSort();

export function preprocess(code: string, options: ParserOptions) {
  const sourceFile = project.createSourceFile(
    `fix${path.parse(options.filepath).ext}`,
    code,
    {
      overwrite: true,
    }
  );

  let imports = getSortedImportDeclarations(sourceFile);
  if (!imports.length) return code;

  // Remove top comments to avoid change by sorting
  const topCommentsRange = {
    pos: 0,
    end: Math.max(imports[0].getStart() - 1, 0),
  };
  const topCommentsText = sourceFile
    .getFullText()
    .substring(topCommentsRange.pos, topCommentsRange.end);
  sourceFile.removeText(topCommentsRange.pos, topCommentsRange.end);

  // Typescript organize to remove unused imports
  sourceFile.organizeImports({}, {});

  imports = getSortedImportDeclarations(sourceFile);
  if (!imports.length) return code;

  const importsData = imports.map(
    (x): OptionalKind<ImportDeclarationStructure> => {
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
          .map(
            (x) =>
              x.getText() +
              (x.getKind() === ts.SyntaxKind.MultiLineCommentTrivia ? "\n" : "")
          ),
        trailingTrivia: x.getTrailingCommentRanges().map((x) => x.getText()),
      };
    }
  );

  const commentsToRemove = imports.reduce<{ pos: number; end: number }[]>(
    (acc, node) => {
      return [
        ...acc,
        ...node.getLeadingCommentRanges().map((x) => ({
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

  sourceFile.insertImportDeclarations(0, finalImports);

  sourceFile.insertText(0, topCommentsText + "\n");

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
