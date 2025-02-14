import { Api, Get, Params, Data, UseStrategy,Version } from "@snail-js/api";

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
class Test {
  @Get("Hello/World")
  test(@Params("id") id: string, @Params() query: {}) {}

  @Get("za/chouq.php")
  @Version('0.2.0')
  @UseStrategy(new CustomStrategy())
  shanheRandom() {}
}

export const TestApi = Service.createApi(Test);
