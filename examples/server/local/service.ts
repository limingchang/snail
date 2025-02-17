import { Server, Snail, Versioning, VersioningType } from "@snail-js/api";

@Server({ baseURL: "/api" })
@Versioning({
  type: VersioningType.Uri,
  defaultVersion: "0.1.0",
})
class BackEnd extends Snail {}

export const Service = new BackEnd();
