import { Server, SnailServer, Versioning, VersioningType } from "@snail-js/api";

@Server({ baseURL: "/api" })
@Versioning({
  type: VersioningType.Uri,
  defaultVersion: "0.1.0",
})
class BackEnd extends SnailServer {}

export const Service = new BackEnd();
