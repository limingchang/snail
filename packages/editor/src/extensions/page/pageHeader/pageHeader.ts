/**
 * `PageHeader`.
 *
 * A name and a side. The whole implementation — schema, node view, commands — is the
 * shared factory in `../utils/furniture.ts`, so the header and the footer cannot drift
 * apart the way the legacy pair did (`headerLing` vs `headerLine`, defect 20).
 */

export { PageHeader } from "../utils/furniture";
