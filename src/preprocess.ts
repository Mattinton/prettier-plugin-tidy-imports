import naturalSort from "natural-sort";
import path from "path";
import { ImportDeclarationStructure, OptionalKind } from "ts-morph";
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
  const sourceFile = project.createSourceFile(
    `fix${path.parse(options.filepath).ext}`,
    code,
    {
      overwrite: true,
    }
  );

  let imports = getImportDeclarations(sourceFile);
  if (!imports.length) return code;

  // Remove top comments to avoid change by sorting
  const topCommentsRange: CommentRangeStructure = {
    pos: 0,
    end: Math.max(imports[0].getStart() - 1, 0),
  };
  const topCommentsText = sourceFile
    .getFullText()
    .substring(topCommentsRange.pos, topCommentsRange.end);
  sourceFile.removeText(topCommentsRange.pos, topCommentsRange.end);

  // Remove side effects to prevent them being sorted by typescript sorter
  imports = getImportDeclarations(sourceFile);
  let sideEffectImports = imports.filter((node) => isSideEffectImport(node));
  const sideEffectImportStructures = sideEffectImports.map(
    getImportDeclarationStructure
  );
  sideEffectImports
    .reduce((acc: CommentRangeStructure[], node) => {
      return [
        ...acc,
        ...node.getLeadingCommentRanges().map(getCommentStructure),
      ];
    }, [])
    .reverse()
    .forEach((comment) => sourceFile.removeText(comment.pos, comment.end));

  imports = getImportDeclarations(sourceFile);
  sideEffectImports = imports.filter((node) => isSideEffectImport(node));
  sideEffectImports.forEach((node) => node.remove());

  // Typescript organize to remove unused imports
  sourceFile.organizeImports({}, {});

  imports = getImportDeclarations(sourceFile);
  if (!imports.length) return code;

  const importStructures = imports.map((node) => {
    node.getNamedImports().sort((a, b) => {
      const aSort = a.getAliasNode()?.getText() ?? a.getName();
      const bSort = b.getAliasNode()?.getText() ?? b.getName();
      return sorter(aSort, bSort);
    });

    return getImportDeclarationStructure(node);
  });

  imports
    .reduce((acc: CommentRangeStructure[], node) => {
      return [
        ...acc,
        ...node.getLeadingCommentRanges().map(getCommentStructure),
      ];
    }, [])
    .reverse()
    .forEach((comment) => {
      sourceFile.removeText(comment.pos, comment.end);
    });
  sourceFile.getImportDeclarations().forEach((node) => node.remove());

  const groupedImports = importStructures.reduce(
    (acc: OptionalKind<ImportDeclarationStructure>[][], node) => {
      const [namespace, thirdParty, relative] = acc;
      if (!!node.namespaceImport) {
        namespace.push(node);
      } else if (!!node.moduleSpecifier.match(/^[./]+/)) {
        relative.push(node);
      } else {
        thirdParty.push(node);
      }
      return acc;
    },
    [[], [], []]
  );

  const finalImports = groupedImports.reduce((acc, group) => {
    const [_namespace, _thirdParty, _relative] = groupedImports;

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

  finalImports.unshift(...sideEffectImportStructures);
  sourceFile.insertImportDeclarations(0, finalImports);

  sourceFile.insertText(0, topCommentsText + "\n");

  return sourceFile.getFullText();
}
