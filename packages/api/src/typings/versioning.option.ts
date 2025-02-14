export enum VersioningType {
  Uri,
  Header,
  Query,
  Custom,
}

interface VersioningCommonOption {
  defaultVersion: string;
}

export interface VersioningUriOption extends VersioningCommonOption {
  type: VersioningType.Uri;
  prefix?: string;
}

export interface VersioningHeaderOption extends VersioningCommonOption {
  type: VersioningType.Header;
  header?: string;
}

export interface VersioningQueryOption extends VersioningCommonOption {
  type: VersioningType.Query;
  key?: string;
}

export interface VersioningCustomOption extends VersioningCommonOption {
  type: VersioningType.Custom;
  extractor: (requestOptions: unknown) => {
    url: string;
    headers: Record<string, any>;
  };
}

export type VersioningOption =
  | VersioningUriOption
  | VersioningHeaderOption
  | VersioningQueryOption
  | VersioningCustomOption;
