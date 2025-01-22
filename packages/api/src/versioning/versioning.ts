import {
  VersioningType,
  VersioningConfig,
  VersioningUriConfig,
  VersioningHeaderConfig,
  VersioningQueryConfig,
  VersioningCustomConfig,
} from "../typings";

const versionHandlers = {
  [VersioningType.Uri]: (
    version: string,
    versioning: VersioningUriConfig,
  ) => {
    const prefix = versioning.prefix || "v";
    return {
      url: `/${prefix}${version}`,
    };
  },
  [VersioningType.Header]: (
    version: string,
    versioning: VersioningHeaderConfig,
  ) => {
    const headers = {
      [versioning.header]: version,
    };
    return {
      headers,
    };
  },
  [VersioningType.Query]: (
    version: string,
    versioning: VersioningQueryConfig,
  ) => {
    const key = versioning.key || "version";
    // const separator = url.includes("?") ? "&" : "?";
    const separator = '?'
    return {
      url: `${separator}${key}=${version}`,
    };
  },
  [VersioningType.Custom]: (
    version: string,
    versioning: VersioningCustomConfig,
  ) => {
    return versioning.extractor({
      version,
    });
  },
};


interface VersioningResult {
  url?: string;
  headers?: Record<string, any>;
}

export function applyVersioning(
  version: string,
  versioning: VersioningConfig,
): VersioningResult {
  const handler = versionHandlers[versioning.type];
  return handler(
    version,
    versioning as VersioningUriConfig &
      VersioningHeaderConfig &
      VersioningQueryConfig &
      VersioningCustomConfig,
  );
}
