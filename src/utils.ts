import { join, dirname, fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

const __filename = fromFileUrl(import.meta.url);
const __dirname = dirname(__filename);

export function getProjectRoot(): string {
  return dirname(__dirname);
}

export function getDataPath(subdir: string): string {
  return join(getProjectRoot(), "data", subdir);
}

export async function ensureDirExists(dirPath: string): Promise<void> {
  try {
    await Deno.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
}

export async function getTempFilePath(prefix = "temp", suffix = ""): Promise<string> {
    const tempDir = getDataPath("temp");
    await ensureDirExists(tempDir);
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const tempFileName = `${prefix}_${uniqueId}${suffix}`;
    return join(tempDir, tempFileName);
}

export async function readJsonFile<T>(file: string): Promise<T | []> {
  try {
    const data = await Deno.readTextFile(file);
    return JSON.parse(data) as T;
  } catch {
    return [];
  }
}

export async function exec(command: string[]): Promise<number> {
  const cmd = new Deno.Command(command.at(0)!, {
    args: command.slice(1),
  });
  const { code } = await cmd.output();
  return code;
}