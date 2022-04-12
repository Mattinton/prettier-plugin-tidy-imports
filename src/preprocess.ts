import { notStrictEqual } from "assert";
import naturalSort from "natural-sort";
import path from "path";
import { ImportDeclarationStructure, OptionalKind, ts } from "ts-morph";
import {
  CommentRangeStructure,
  getCommentStructure,
  getFilePathDepth,
  getImportDeclarations,
  getImportDeclarationStructure,
  ParserOptions,
  isSideEffectImport,
  getTidyImportsProject,
} from "./utils";

const project = getTidyImportsProject();

const sorter = naturalSort();

export function preprocess(code: string, options: ParserOptions) {
  const fileExtension = path.parse(options.filepath).ext.replace("j", "t");

  const originalFile = project.createSourceFile(
    `original${fileExtension}`,
    code,
    {
      overwrite: true,
    }
  );

  let imports = getImportDeclarations(originalFile);
  if (!imports.length) return code;

  // Remove anything above the first import so we don't process them
  const aboveImportsRange: CommentRangeStructure = {
    pos: 0,
    end: Math.max(imports[0].getStart() - 1, 0),
  };
  const aboveImportsText = originalFile
    .getFullText()
    .substring(aboveImportsRange.pos, aboveImportsRange.end);

  const processFile = project.createSourceFile(
    `process${fileExtension}`,
    originalFile.getFullText().substring(aboveImportsRange.end),
    {
      overwrite: true,
    }
  );

  // Remove side effects to prevent them being sorted by typescript sorter
  imports = getImportDeclarations(processFile);
  const sideEffectImportStructures = imports.reduce(
    (acc, importDeclaration) => {
      if (isSideEffectImport(importDeclaration)) {
        acc.push(getImportDeclarationStructure(importDeclaration));
      }
      return acc;
    },
    [] as OptionalKind<ImportDeclarationStructure>[]
  );

  processFile.organizeImports();
  imports = getImportDeclarations(processFile);

  const importStructures = imports.map((node) => {
    const struct = getImportDeclarationStructure(node);

    struct.namedImports.sort((a, b) => {
      const aSort = a.alias ?? a.name;
      const bSort = b.alias ?? b.name;
      return sorter(aSort, bSort);
    });

    return struct;
  });

  const groupedImports = importStructures.reduce(
    (acc: OptionalKind<ImportDeclarationStructure>[][], node) => {
      const [namespace, thirdParty, relative] = acc;

      if (!!node.namespaceImport) {
        namespace.push(node);
      } else if (!!node.defaultImport || !!node.namedImports.length) {
        if (!!node.moduleSpecifier.match(/^[./]+/)) {
          relative.push(node);
        } else {
          thirdParty.push(node);
        }
      }

      // if no match then it was a side effect import

      return acc;
    },
    [[], [], []]
  );

  const finalImports = groupedImports.reduce((acc, group) => {
    group.sort((a, b) => {
      const aName = a.moduleSpecifier;
      const bName = b.moduleSpecifier;

      const defaultDiff = +!!b.defaultImport - +!!a.defaultImport;
      if (defaultDiff !== 0) return defaultDiff;

      const depthDiff = getFilePathDepth(aName) - getFilePathDepth(bName);
      if (depthDiff !== 0) {
        return depthDiff / Math.abs(depthDiff);
      }

      return sorter(aName, bName);
    });

    return [...acc, ...group];
  }, []);

  const fixedFile = project.createSourceFile(
    `fixed${fileExtension}`,
    processFile
      .getFullText()
      .substring(
        (imports[imports.length - 1]?.getTrailingTriviaEnd() ?? 0) + 1
      ),
    {
      overwrite: true,
    }
  );

  finalImports.unshift(...sideEffectImportStructures);
  fixedFile.insertImportDeclarations(0, finalImports);

  fixedFile.insertText(0, aboveImportsText + "\n");

  return fixedFile.getFullText();
}
