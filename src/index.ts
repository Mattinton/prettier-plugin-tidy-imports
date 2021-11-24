import type { Parser } from "prettier";
import parserTypescript from "prettier/parser-typescript";
import { preprocess } from "./preprocess";

const typescriptParser = parserTypescript.parsers.typescript;

export const parsers: Record<"typescript", Parser> = {
  typescript: {
    ...typescriptParser,
    preprocess: (code, options) =>
      typescriptParser.preprocess
        ? typescriptParser.preprocess(preprocess(code, options), options)
        : preprocess(code, options),
  },
};
