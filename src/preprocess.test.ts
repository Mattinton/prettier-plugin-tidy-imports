import fs from "fs";
import path from "path";
import {
  getImportDeclarations,
  getImportDeclarationStructure,
  getTidyImportsProject,
  ParserOptions,
} from "./utils";
import { preprocess } from "./preprocess";

describe("preprocess", () => {
  test("works standalone", () => {
    const filePath = path.join(__dirname, "../test/cases/1.tsx");
    const code = preprocess(fs.readFileSync(filePath, "utf-8"), {
      filepath: "test/cases/1.tsx",
    } as ParserOptions);

    const project = getTidyImportsProject();
    const sourceFile = project.createSourceFile(
      `fix${path.parse(filePath).ext}`,
      code
    );

    const imports = getImportDeclarations(sourceFile).map(
      getImportDeclarationStructure
    );

    console.log(code);

    expect(imports.map((x) => x.moduleSpecifier)).toStrictEqual([
      "tailwindcss/tailwind.css",
      "focus-visible",
      "./side-effect-local",
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
