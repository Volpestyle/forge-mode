import { promises as fs } from "fs";
import path from "path";
import { Storage } from "./storage";

export class LocalStorage implements Storage {
  constructor(private root: string, private publicBaseUrl: string) {}

  async putObject(args: { key: string; data: Uint8Array; contentType: string }) {
    const target = path.join(this.root, args.key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, args.data);
    return { url: `${this.publicBaseUrl}/${args.key}` };
  }
}
