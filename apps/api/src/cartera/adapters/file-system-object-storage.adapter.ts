import { Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ObjectStorage, StoredObject } from "../ports/object-storage.port";

@Injectable()
export class FileSystemObjectStorage implements ObjectStorage {
  private readonly rootPath = join(process.cwd(), "..", "..", "storage");

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType?: string;
  }): Promise<StoredObject> {
    const targetPath = join(this.rootPath, input.key);

    await mkdir(dirname(targetPath), {
      recursive: true
    });
    await writeFile(targetPath, input.body);

    return {
      key: input.key,
      url: `file://${targetPath}`
    };
  }
}
