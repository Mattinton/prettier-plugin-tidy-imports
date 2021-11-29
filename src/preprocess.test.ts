import prettier from "prettier";
import fs from "fs";
import path from "path";
import {
  getImportDeclarations,
  getImportDeclarationStructure,
  getTidyImportsProject,
} from "./utils";

describe("preprocess", () => {
  test("works", () => {
    const plugin = require(".");

    const filePath = path.join(__dirname, "../test/cases/1.tsx");
    const code = prettier.format(fs.readFileSync(filePath, "utf-8"), {
      filepath: filePath,
      parser: "typescript",
      plugins: [plugin],
    });

    const project = getTidyImportsProject();
    const sourceFile = project.createSourceFile(
      `fix${path.parse(filePath).ext}`,
      code
    );

    const imports = getImportDeclarations(sourceFile).map(
      getImportDeclarationStructure
    );

    expect(imports.map((x) => x.moduleSpecifier)).toStrictEqual([
      "tailwindcss/tailwind.css",
      "focus-visible",
      "next/document",
      "react",
      "firebase/auth",
      "next/dist/shared/lib/router/router",
      "react-error-boundary",
      "reactfire",
      "~components/pages/_app/layout",
    ]);
  });
});
