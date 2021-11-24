import prettier from "prettier";
import fs from "fs";
import path from "path";

describe("preprocess", () => {
  test("works", () => {
    const plugin = require(".");

    const filePath = path.join(__dirname, "../test/cases/1.tsx");
    const text = prettier.format(fs.readFileSync(filePath, "utf-8"), {
      filepath: filePath,
      parser: "typescript",
      plugins: [plugin],
    });

    console.log(text);
  });
});
