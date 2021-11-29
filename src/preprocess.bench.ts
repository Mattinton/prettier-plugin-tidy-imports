import prettier from "prettier";
import { benchmarkSuite } from "jest-bench";
import path from "path";
import fs from "fs";

benchmarkSuite("preprocess", {
  test: () => {
    const plugin = require(".");

    const filePath = path.join(__dirname, "../test/cases/1.tsx");
    prettier.format(fs.readFileSync(filePath, "utf-8"), {
      filepath: filePath,
      parser: "typescript",
      plugins: [plugin],
    });
  },
});
