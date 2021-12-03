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
  const originalFile = project.createSourceFile(
    `original${path.parse(options.filepath).ext}`,
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
    `process${path.parse(options.filepath).ext}`,
    originalFile.getFullText().substring(aboveImportsRange.end),
    {
      overwrite: true,
    }
  );

  // Remove side effects to prevent them being sorted by typescript sorter
  imports = getImportDeclarations(processFile);
  const sideEffectImportStructures = imports
    .filter((node) => isSideEffectImport(node))
    .map(getImportDeclarationStructure);

  processFile.organizeImports();

  imports = getImportDeclarations(processFile);
  if (!imports.length) return code;

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
      } else if (!!node.moduleSpecifier.match(/^[./]+/)) {
        relative.push(node);
      } else if (!!node.defaultImport || !!node.namedImports.length) {
        thirdParty.push(node);
      }

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
    `fixed${path.parse(options.filepath).ext}`,
    processFile
      .getFullText()
      .substring(imports[imports.length - 1].getTrailingTriviaEnd() + 1),
    {
      overwrite: true,
    }
  );

  finalImports.unshift(...sideEffectImportStructures);
  fixedFile.insertImportDeclarations(0, finalImports);

  fixedFile.insertText(0, aboveImportsText + "\n");

  return fixedFile.getFullText();
}
