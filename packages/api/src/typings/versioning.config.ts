export enum VersioningType {
  Uri,
  Header,
  Query,
  Custom,
}

interface VersioningCommonConfig {
  defaultVersion: string;
}

export interface VersioningUriConfig extends VersioningCommonConfig {
  type: VersioningType.Uri;
  prefix?: string;
}

export interface VersioningHeaderConfig extends VersioningCommonConfig {
  type: VersioningType.Header;
  header: string;
}

export interface VersioningQueryConfig extends VersioningCommonConfig {
  type: VersioningType.Query;
  key?: string;
}

export interface VersioningCustomConfig extends VersioningCommonConfig {
  type: VersioningType.Custom;
  extractor: (requestOptions: unknown) => {
    url: string;
    headers: Record<string, any>;
  };
}

export type VersioningConfig =
  | VersioningUriConfig
  | VersioningHeaderConfig
  | VersioningQueryConfig
  | VersioningCustomConfig;
