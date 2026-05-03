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

// Wrap Express app in a plain HTTP server so WebSocket can share the same port
const server = createServer(app);

// Attach WebSocket price stream at ws://.../api/ws/prices
initPriceStream(server);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error starting server");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
