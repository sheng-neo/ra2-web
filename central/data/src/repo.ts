/**
 * 源码仓库位置：ODbL 4.6 要求公开衍生数据库或其生成方法，鸣谢页与 LICENSE-ODbL.txt 都指向这里。
 * 仓库改名、迁移或默认分支改名时只改这一处，再跑 pnpm citymap 重新生成署名文件。
 */
export const SOURCE_REPO_URL = 'https://github.com/sheng-neo/ra2-web';

/** 默认分支上 central/ 目录（离线管线、原始快照、产物）的网页地址。 */
export const SOURCE_TREE_URL = `${SOURCE_REPO_URL}/tree/main/central`;

/** 仓库里某个文件（相对 central/）在默认分支上的网页地址。 */
export function sourceFileUrl(pathInCentral: string): string {
  return `${SOURCE_REPO_URL}/blob/main/central/${pathInCentral}`;
}
