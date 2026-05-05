import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initPriceStream } from "./lib/priceStream";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

// initPriceStream is async (creates price_history table, attaches WS server)
initPriceStream(server).catch((err) => {
  logger.error({ err }, "Price stream init failed — continuing without price streaming");
});

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error starting server");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
