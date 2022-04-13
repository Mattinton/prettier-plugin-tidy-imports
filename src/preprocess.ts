import path from "path";
import type { ImportDeclarationStructure, OptionalKind } from "ts-morph";
import {
  CommentRangeStructure,
  getFilePathDepth,
  getImportDeclarationStructure,
  ParserOptions,
  isSideEffectImport,
  getTidyImportsProject,
  sortImportDeclarationsByPos,
  sorter,
} from "./utils";

const project = getTidyImportsProject();

export function preprocess(code: string, options: ParserOptions) {
  const fileExtension = path.parse(options.filepath).ext.replace("j", "t");

  const originalFile = project.createSourceFile(
    `original${fileExtension}`,
    code,
    {
      overwrite: true,
    }
  );

  let imports = originalFile.getImportDeclarations();
  if (!imports.length) return code;
  imports.sort(sortImportDeclarationsByPos);

  // Remove anything above the first import so we don't process them
  const aboveImportsRange: CommentRangeStructure = {
    pos: 0,
    end: Math.max(imports[0].getStart(), 0),
  };
  const aboveImportsText = originalFile
    .getFullText()
    .substring(aboveImportsRange.pos, aboveImportsRange.end);

  const processFile = project.createSourceFile(
    `process${fileExtension}`,
    originalFile.getFullText().substring(aboveImportsRange.end).trimStart(),
    {
      overwrite: true,
    }
  );

  imports = processFile.getImportDeclarations();
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

  imports = processFile.getImportDeclarations();
  const importStructures = imports.reduce((acc, importDeclaration) => {
    if (!isSideEffectImport(importDeclaration)) {
      acc.push(getImportDeclarationStructure(importDeclaration));
    }
    return acc;
  }, [] as OptionalKind<ImportDeclarationStructure>[]);

  const groupedImports = importStructures.reduce(
    (acc: OptionalKind<ImportDeclarationStructure>[][], node) => {
      const [namespace, thirdParty, relative] = acc;

      if (!!node.namespaceImport) {
        namespace.push(node);
      } else if (!!node.defaultImport || !!node.namedImports?.length) {
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
    "\n\n" +
      processFile
        .getFullText()
        .substring(imports[imports.length - 1]?.getTrailingTriviaEnd() ?? 0)
        .trimStart(),
    {
      overwrite: true,
    }
  );

  finalImports.unshift(...sideEffectImportStructures);
  fixedFile.insertImportDeclarations(0, finalImports);

  fixedFile.insertText(0, aboveImportsText);

  return fixedFile.getFullText();
}
