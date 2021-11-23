import prettier from "prettier";
import * as plugin from "./";

const code = `
import 'side-effect-import-1';
import defaultBThirdParty, { bThirdParty1, bThirdParty } from 'b-third-party';
import aThirdParty from 'a-third-party';
// This is a namespace import
import * as namespace from 'namespace';
/**
 * Multi line comments
 */
import defaultLocal, { local } from './local';
import { alongLocal as aLongAliasTest } from '../../../a-local';
import { longLocal } from '../../../b-local';
import { medLocal } from '../../a-local';
import atThirdParty from '@third-party';
import 'side-effect-import-2';

/**
 * Another test comment
 */
function testFunc() {
  defaultBThirdParty();
  bThirdParty();
  aThirdParty();
  namespace.test();
  defaultLocal();
  local();
  medLocal();
  longLocal();
  atThirdParty();
  aLongAliasTest();
  bThirdParty1();
}
`;

describe("preprocess", () => {
  test("works", () => {
    const text = prettier.format(code, {
      parser: "typescript",
      plugins: [plugin],
    });

    console.log(text);
  });
});
