import {
  VersioningType,
  VersioningOption,
  VersioningUriOption,
  VersioningHeaderOption,
  VersioningQueryOption,
  VersioningCustomOption,
} from "../typings";

import { VERSIONING_KEY } from "../decorators/versioning";

import { SnailServer } from "../core/snailServer";

const versionHandlers = {
  [VersioningType.Uri]: (version: string, versioning: VersioningUriOption) => {
    const prefix = versioning.prefix || "v";
    return {
      type: VersioningType.Uri,
      result: `${prefix}${version}`,
    };
  },
  [VersioningType.Header]: (
    version: string,
    versioning: VersioningHeaderOption
  ) => {
    const headers = {
      [versioning.header || "version"]: version,
    };
    return {
      type: VersioningType.Header,
      result: headers,
    };
  },
  [VersioningType.Query]: (
    version: string,
    versioning: VersioningQueryOption
  ) => {
    const key = versioning.key || "v";
    // const separator = url.includes("?") ? "&" : "?";
    return {
      type: VersioningType.Query,
      result: {
        [key]: version,
      },
    };
  },
  [VersioningType.Custom]: (
    version: string,
    versioning: VersioningCustomOption
  ) => {
    return versioning.extractor({
      version,
    });
  },
};

export interface VersioningResult {
  type: VersioningType;
  result: string|Record<string, any>;
}

/**
 *
 * @param version 版本号
 * @param serverInstance 当前Server的实例
 * @returns serverInstance上未配置版本管理器返回undefined, 否则返回版本管理器的结果
 */
export function applyVersioning(
  version: string,
  versioning: VersioningOption
): VersioningResult | undefined {
  if (!versioning) return undefined;
  const handler = versionHandlers[versioning.type];
  return handler(
    version,
    versioning as VersioningUriOption &
      VersioningHeaderOption &
      VersioningQueryOption &
      VersioningCustomOption
  );
}
