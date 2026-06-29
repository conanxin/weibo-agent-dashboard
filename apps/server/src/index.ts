import { createApp } from "./app.js";
import { getServerConfig } from "./config.js";

const config = getServerConfig();
const app = await createApp();

try {
  const url = await app.listen({
    host: config.host,
    port: config.port
  });
  app.log.info(
    {
      url,
      mockMode: config.mockMode,
      databasePath: config.databasePath
    },
    "Weibo Agent Dashboard server started"
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
