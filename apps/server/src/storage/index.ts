import path from "path";
import { config } from "../config";
import { Storage } from "./storage";
import { LocalStorage } from "./localStorage";

export const createStorage = (baseUrl: string): Storage => {
  if (config.objectStore === "local") {
    const root = path.resolve(process.cwd(), "storage");
    return new LocalStorage(root, `${baseUrl}/storage`);
  }

  throw new Error(`Unsupported object store: ${config.objectStore}`);
};
