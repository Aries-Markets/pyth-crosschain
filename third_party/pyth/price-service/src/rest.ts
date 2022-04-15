import express from "express";
import cors from "cors";
import { Request, Response } from "express";
import { PriceFeedVaaInfo } from "./listen";
import { logger } from "./logging";
import { PromClient } from "./promClient";
import { DurationInSec } from "./helpers";


export class RestAPI {
  private port: number;
  private priceFeedVaaInfo: PriceFeedVaaInfo;
  private isReady: (() => boolean) | undefined;
  private promClient: PromClient | undefined;

  constructor(config: { port: number; }, 
    priceFeedVaaInfo: PriceFeedVaaInfo,
    isReady?: () => boolean,
    promClient?: PromClient) {
    this.port = config.port;
    this.priceFeedVaaInfo = priceFeedVaaInfo;
    this.isReady = isReady;
    this.promClient = promClient;
  }

  // Run this function without blocking (`await`) if you want to run it async.
  async run() {
    const app = express();
    app.use(cors());

    app.listen(this.port, () =>
      logger.debug("listening on REST port " + this.port)
    );

    let endpoints: string[] = [];

    app.get("/latest_vaa_bytes/:price_feed_id", (req: Request, res: Response) => {
      this.promClient?.incApiLatestVaaRequests();
      logger.info(`Received latest_vaa_bytes request for ${req.params.price_feed_id}`)

      let latestVaa = this.priceFeedVaaInfo.getLatestVaaForPriceFeed(req.params.price_feed_id);

      if (latestVaa === undefined) {
        this.promClient?.incApiLatestVaaNotFoundResponse();
        res.sendStatus(404);
        return;
      }

      this.promClient?.incApiLatestVaaSuccessResponse();

      const freshness: DurationInSec = (new Date).getTime()/1000 - latestVaa.receiveTime;
      this.promClient?.addApiLatestVaaFreshness(freshness);

      res.status(200);
      res.write(latestVaa.vaaBytes);
      res.end();
    });
    endpoints.push("latest_vaa_bytes/<price_feed_id>");

    app.get("/ready", (_, res: Response) => {
      if (this.isReady!()) {
        res.sendStatus(200);
      } else {
        res.sendStatus(503);
      }
    });
    endpoints.push('ready');

    app.get("/live", (_, res: Response) => {
      res.sendStatus(200);
    });
    endpoints.push("live");


    app.get("/", (_, res: Response) =>
      res.json(endpoints)
    );
  }
}