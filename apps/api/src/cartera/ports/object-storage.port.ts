export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");

export type StoredObject = {
  key: string;
  url?: string;
};

export interface ObjectStorage {
  putObject(input: {
    key: string;
    body: Buffer;
    contentType?: string;
  }): Promise<StoredObject>;
}
