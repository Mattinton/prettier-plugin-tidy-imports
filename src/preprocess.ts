import naturalSort from "natural-sort";
import {
  Project,
  ImportDeclaration,
  ImportDeclarationStructure,
  OptionalKind,
} from "ts-morph";
import { tsconfigResolverSync } from "tsconfig-resolver";

type ParserOptions = {};

const result = tsconfigResolverSync();
if (!result || !result.exists) throw new Error("Could not find tsconfig.json");

const project = new Project({
  skipAddingFilesFromTsConfig: true,
  skipLoadingLibFiles: true,
  tsConfigFilePath: result.path,
  skipFileDependencyResolution: true,
});

export function preprocess(code: string, _options: ParserOptions) {
  const sourceFile = project.createSourceFile("file.ts", code, {
    overwrite: true,
  });

  sourceFile.organizeImports();

  const imports = sourceFile.getImportDeclarations();
  const groupedImports: ImportDeclaration[][] = [[], [], [], []];

  imports.forEach((node) => {
    const [sideEffect, namespace, thirdParty, relative] = groupedImports;

    if (!!node.getNamespaceImport()) {
      namespace.push(node);
    } else if (!!node.isModuleSpecifierRelative()) {
      relative.push(node);
    } else if (!!node.getDefaultImport() || !!node.getNamedImports()?.length) {
      thirdParty.push(node);
    } else {
      sideEffect.push(node);
    }
  });

  const finalImports: ImportDeclaration[] = groupedImports.reduce(
    (acc, group) => {
      group.sort((a, b) => {
        const aName = a.getModuleSpecifierValue();
        const bName = b.getModuleSpecifierValue();

        const defaultDiff = +!!b.getDefaultImport() - +!!a.getDefaultImport();
        if (defaultDiff !== 0) return defaultDiff;

        const depthDiff = filePathDepth(aName) - filePathDepth(bName);
        if (depthDiff !== 0) {
          return depthDiff / Math.abs(depthDiff);
        }

        return naturalSort()(aName, bName);
      });

      return [...acc, ...group];
    },
    []
  );

  const newImports: OptionalKind<ImportDeclarationStructure>[] =
    finalImports.map((x) => {
      const namedImports = x.getNamedImports();
      namedImports.sort((a, b) => {
        const aSort = a.getAliasNode()?.getText() ?? a.getName();
        const bSort = b.getAliasNode()?.getText() ?? b.getName();
        return naturalSort()(aSort, bSort);
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
      };
    });
  finalImports.forEach((node) => node.remove());
  sourceFile.insertImportDeclarations(0, newImports);

  return sourceFile.getFullText();
}

function filePathDepth(path: string) {
  return path.match(/^[./]+/g)?.[0]?.length ?? 0;
}
