/**
 * Helper utility for folder uploads, drag-and-drop traversal,
 * natural sorting, and media categorization.
 */

export const SUPPORTED_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tiff', '.jfif', '.avif'];
export const SUPPORTED_VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.flv', '.wmv'];
export const SUPPORTED_AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma'];

export const ALL_MEDIA_EXTS = [
  ...SUPPORTED_IMAGE_EXTS,
  ...SUPPORTED_VIDEO_EXTS,
  ...SUPPORTED_AUDIO_EXTS,
];

export type MediaCategory = 'image' | 'video' | 'audio' | 'unsupported';

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.slice(lastDot).toLowerCase() : '';
}

export function categorizeFile(filename: string): MediaCategory {
  const ext = getFileExtension(filename);
  if (SUPPORTED_IMAGE_EXTS.includes(ext)) return 'image';
  if (SUPPORTED_VIDEO_EXTS.includes(ext)) return 'video';
  if (SUPPORTED_AUDIO_EXTS.includes(ext)) return 'audio';
  return 'unsupported';
}

export function isSupportedMedia(filename: string): boolean {
  return categorizeFile(filename) !== 'unsupported';
}

/**
 * Naturally sorts files numerically by filename:
 * e.g. 1.png, 2.png, 10.png, 11.png instead of 1.png, 10.png, 11.png, 2.png.
 */
export function naturalSortFiles(files: File[]): File[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Recursively extracts all files from dropped DataTransfer,
 * descending into folders and subfolders seamlessly without freezing.
 */
export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = [];
  const items = dataTransfer.items;

  if (!items || items.length === 0) {
    return Array.from(dataTransfer.files);
  }

  const traverseEntry = async (entry: any): Promise<void> => {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            files.push(file);
            resolve();
          },
          () => resolve()
        );
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readAllEntries = async (): Promise<any[]> => {
        const all: any[] = [];
        let batch: any[] = [];
        do {
          batch = await new Promise<any[]>((resolve) => {
            dirReader.readEntries(
              (entries: any[]) => resolve(entries),
              () => resolve([])
            );
          });
          all.push(...batch);
        } while (batch.length > 0);
        return all;
      };

      const childEntries = await readAllEntries();
      for (const child of childEntries) {
        await traverseEntry(child);
      }
    }
  };

  const entryPromises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entryPromises.push(traverseEntry(entry));
        continue;
      }
    }
    const f = item.getAsFile();
    if (f) files.push(f);
  }

  if (entryPromises.length > 0) {
    await Promise.all(entryPromises);
  }

  return files.length > 0 ? files : Array.from(dataTransfer.files);
}
