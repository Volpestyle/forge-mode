import { buildApp } from "./app";
import { config } from "./config";

const start = async () => {
  const app = buildApp();
  try {
    await app.listen({ port: config.port, host: "0.0.0.0" });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
