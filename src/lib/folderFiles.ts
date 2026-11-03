import { IGNORED_FILE_RE } from '../constants/intransit'

/*
 * Files of a folder the person picked or dropped (In-transit Stock > Input files, user 2026-10-16), every subfolder
 * included, and their match to the report's inputs by name.
 */

export type FolderFile = { file: File; path: string }

/** The loose name match of a file to an input: case, punctuation and a browser's " (1)" ignored. */
export const fileKey = (n: string) => n.toLowerCase().replace(/\s*\(\d+\)(?=\.[^.]+$)/, '').replace(/\.(csv|xlsx)$/, '').replace(/[^a-z0-9]/g, '')

const keep = (f: FolderFile) => !IGNORED_FILE_RE.test(f.file.name)

/** From <input type="file" webkitdirectory>: each File carries its path inside the folder. */
export const filesFromInput = (list: FileList): FolderFile[] =>
  [...list].map((file) => ({ file, path: file.webkitRelativePath || file.name })).filter(keep)

/** Every entry of a folder (readEntries hands them out in batches of up to 100). */
const readDir = (dir: FileSystemDirectoryEntry) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => {
    const reader = dir.createReader()
    const out: FileSystemEntry[] = []
    const next = () => reader.readEntries((batch) => (batch.length ? (out.push(...batch), next()) : resolve(out)), reject)
    next()
  })

const fileOf = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject))

const walk = async (entry: FileSystemEntry, out: FolderFile[]): Promise<void> => {
  if (entry.isFile) out.push({ file: await fileOf(entry as FileSystemFileEntry), path: entry.fullPath.replace(/^\//, '') })
  else if (entry.isDirectory) for (const child of await readDir(entry as FileSystemDirectoryEntry)) await walk(child, out)
}

/**
 * The entries of a drop, or null when no folder was dropped (plain files keep the normal upload). Read synchronously:
 * the drop's items are gone once the event handler returns.
 */
export const dropEntries = (dt: DataTransfer): FileSystemEntry[] | null => {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  return entries.some((e) => e.isDirectory) ? entries : null
}

/** Every file under the dropped entries (folders read recursively). */
export const filesFromEntries = async (entries: FileSystemEntry[]): Promise<FolderFile[]> => {
  const out: FolderFile[] = []
  for (const e of entries) await walk(e, out)
  return out.filter(keep)
}

export interface FolderMatch {
  /** The folder's name (first part of the paths). */
  folder: string
  /** One file per input it matched. */
  matched: { input: string; file: File; path: string }[]
  /** Inputs matched by more than one file: the most recently changed is kept. */
  duplicates: { input: string; kept: string; skipped: string[] }[]
  /** Files that are not an input of the report. */
  ignored: string[]
  /** Inputs with no file in the folder. */
  missing: string[]
}

export const matchFolder = (files: FolderFile[], inputs: string[]): FolderMatch => {
  const byKey = new Map(inputs.map((n) => [fileKey(n), n]))
  const hits = new Map<string, FolderFile[]>()
  const ignored: string[] = []
  for (const f of files) {
    const input = byKey.get(fileKey(f.file.name))
    if (!input) ignored.push(f.path)
    else hits.set(input, [...(hits.get(input) ?? []), f])
  }
  const matched: FolderMatch['matched'] = []
  const duplicates: FolderMatch['duplicates'] = []
  for (const input of inputs) {
    const list = (hits.get(input) ?? []).sort((a, b) => b.file.lastModified - a.file.lastModified)
    if (!list.length) continue
    matched.push({ input, file: list[0].file, path: list[0].path })
    if (list.length > 1) duplicates.push({ input, kept: list[0].path, skipped: list.slice(1).map((f) => f.path) })
  }
  return {
    folder: files[0]?.path.split('/')[0] ?? '',
    matched,
    duplicates,
    ignored,
    missing: inputs.filter((n) => !hits.has(n)),
  }
}
