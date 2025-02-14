import {
  VersioningType,
  VersioningOption,
  VersioningUriOption,
  VersioningHeaderOption,
  VersioningQueryOption,
  VersioningCustomOption,
} from "../typings";

const versionHandlers = {
  [VersioningType.Uri]: (version: string, versioning: VersioningUriOption) => {
    const prefix = versioning.prefix || "v";
    return {
      url: `${prefix}${version}`,
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
      headers,
    };
  },
  [VersioningType.Query]: (
    version: string,
    versioning: VersioningQueryOption
  ) => {
    const key = versioning.key || "version";
    // const separator = url.includes("?") ? "&" : "?";
    return {
      params: {
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

interface VersioningResult {
  url?: string;
  headers?: Record<string, any>;
  params?: Record<string, any>;
}

export function applyVersioning(
  version: string,
  versioning: VersioningOption
): VersioningResult {
  const handler = versionHandlers[versioning.type];
  return handler(
    version,
    versioning as VersioningUriOption &
      VersioningHeaderOption &
      VersioningQueryOption &
      VersioningCustomOption
  );
}
