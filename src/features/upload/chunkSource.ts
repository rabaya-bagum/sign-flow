/** Random-access byte reader used by uploads, so large files are never fully loaded into memory. */
export interface ChunkSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  close(): void;
}

export function memorySource(bytes: Uint8Array): ChunkSource {
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
    close: () => undefined,
  };
}

/** Web: a picked File/Blob. */
export function blobSource(blob: Blob): ChunkSource {
  return {
    size: blob.size,
    read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
    close: () => undefined,
  };
}

/** Native: reads through an expo-file-system FileHandle (seek + read), never the whole file. */
export async function fileUriSource(uri: string): Promise<ChunkSource> {
  const { File } = await import('expo-file-system');
  const file = new File(uri);
  const size = file.size;
  let handle: ReturnType<typeof file.open> | null = null;
  return {
    size,
    read: async (offset, length) => {
      handle ??= file.open();
      handle.offset = offset;
      return handle.readBytes(length);
    },
    close: () => {
      handle?.close();
      handle = null;
    },
  };
}
