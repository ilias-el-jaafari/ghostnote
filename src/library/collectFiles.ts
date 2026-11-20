/** Collect File objects from a file input or a drag-and-drop, including folders. */

type EntryLike = {
  isFile: boolean
  isDirectory: boolean
  file?: (ok: (file: File) => void, err?: (error: Error) => void) => void
  createReader?: () => { readEntries: (ok: (entries: EntryLike[]) => void, err?: (error: Error) => void) => void }
}

function asEntry(item: DataTransferItem): EntryLike | undefined {
  const anyItem = item as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }
  return anyItem.webkitGetAsEntry?.() ?? undefined
}

async function readAllEntries(reader: NonNullable<EntryLike['createReader']> extends () => infer R ? R : never): Promise<EntryLike[]> {
  const batches: EntryLike[] = []
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    if (batch.length === 0) break
    batches.push(...batch)
  }
  return batches
}

async function walkEntry(entry: EntryLike, into: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file?.(resolve, reject)
    })
    into.push(file)
    return
  }
  if (entry.isDirectory && entry.createReader) {
    const children = await readAllEntries(entry.createReader())
    for (const child of children) await walkEntry(child, into)
  }
}

export async function filesFromDataTransfer(data: DataTransfer): Promise<File[]> {
  const files: File[] = []
  const items = data.items
  if (items && items.length > 0) {
    const entries: EntryLike[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item) continue
      const entry = asEntry(item)
      if (entry) entries.push(entry)
      else if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (entries.length > 0) {
      for (const entry of entries) await walkEntry(entry, files)
      if (files.length > 0) return files
    }
  }
  return Array.from(data.files)
}

export function filesFromList(list: FileList | File[]): File[] {
  return Array.from(list)
}
