import { 
  VersioningType, 
  VersioningConfig,
  VersioningUriConfig,
  VersioningHeaderConfig,
  VersioningQueryConfig,
  VersioningCustomConfig
} from "../typings";
import { ApiConfig } from "../typings/api.config";

const versionHandlers = {
  [VersioningType.Uri]: (url: string, version: string, versioning: VersioningUriConfig) => {
    const prefix = versioning.prefix || 'v';
    return `/${prefix}${version}/${url}`;
  },
  [VersioningType.Header]: (url: string, version: string, versioning: VersioningHeaderConfig, apiConfig?: ApiConfig) => {
    const headers = {
      ...apiConfig?.headers,
      [versioning.header]: version
    };
    return {
      url,
      config: {
        ...apiConfig,
        headers
      }
    };
  },
  [VersioningType.Query]: (url: string, version: string, versioning: VersioningQueryConfig) => {
    const key = versioning.key || 'version';
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${key}=${version}`;
  },
  [VersioningType.Custom]: (url: string, version: string, versioning: VersioningCustomConfig, apiConfig?: ApiConfig) => {
    return versioning.extractor({
      url,
      version,
      config: apiConfig
    });
  }
};

export function applyVersioning(
  url: string,
  version: string,
  versioning: VersioningConfig,
  apiConfig?: ApiConfig
) {
  const handler = versionHandlers[versioning.type];
  return handler(
    url, 
    version, 
    versioning as VersioningUriConfig & VersioningHeaderConfig & VersioningQueryConfig & VersioningCustomConfig,
    apiConfig
  );
}
