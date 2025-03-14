import {
  Api,
  Get,
  Post,
  Params,
  Query,
  Data,
  UseStrategy,
  Version,
  NoCache,
  SnailApi,
  HitSource
} from "@snail-js/api";

import { Service, CustomStrategy } from "../service";

export class ShanHeApiRandom {
  format: number;
  draw: string;
  annotate: string;
  explain: string;
  details: string;
  source: string;
  image: string;
}

@Api()
// @HitSource("shanhe.Test.shanheRandom")
class Test extends SnailApi {
  @Get("/Hello/World/:id")
  test(@Params("id") id: string, @Data() query: {}) {}

  @Get("za/chouq.php")
  // @Version("0.2.1")
  // @UseStrategy(new CustomStrategy())
  // @NoCache()
  @UseStrategy(CustomStrategy)
  shanheRandom() {}

  @Get("za/nl.php")
  @HitSource("shanhe.Test.shanheRandom")
  shanheNongli() {
    // 山河农历
  }
}
export const TestApi = Service.createApi(Test);