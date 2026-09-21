/**
 * `PageHeader`。
 *
 * 一个名字加一个 side。全部实现——schema、节点视图、命令——都是 `../utils/furniture.ts` 里的共享
 * 工厂，所以页眉和页脚不会像旧版那一对那样各走各的（`headerLing` 对 `headerLine`，缺陷 20）。
 *
 * `PageHeader`.
 *
 * A name and a side. The whole implementation — schema, node view, commands — is the
 * shared factory in `../utils/furniture.ts`, so the header and the footer cannot drift
 * apart the way the legacy pair did (`headerLing` vs `headerLine`, defect 20).
 */

export { PageHeader } from "../utils/furniture";
