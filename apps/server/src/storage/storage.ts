export type Storage = {
  putObject(args: { key: string; data: Uint8Array; contentType: string }): Promise<{ url: string }>;
};
