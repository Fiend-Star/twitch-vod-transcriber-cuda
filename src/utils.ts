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
    const cmd = new Deno.Command(command[0], {
        args: command.slice(1),
        stdout: "piped",
        stderr: "piped"
    });

    const process = cmd.spawn();
    const decoder = new TextDecoder();

    const streamLogs = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            console.log(decoder.decode(value));
        }
    };

    await Promise.all([
        streamLogs(process.stdout.getReader()),
        streamLogs(process.stderr.getReader())
    ]);

    return (await process.status).code;
}

/**
 * Filters an array of video IDs based on specified criteria or a list of specific VODs
 * @param videoIDs - Array of video ID strings to filter
 * @param criteria - Optional filtering criteria ('latest', 'first', 'even', 'odd')
 * @param specificVODs - Optional specific VOD IDs to filter for
 * @returns Filtered array of video IDs
 */
export function filterVideoIDs(
    videoIDs: string[],
    criteria?: string,
    specificVODs?: string[] | string
): string[] {
    // Input validation
    if (!Array.isArray(videoIDs)) {
        console.error("❌ videoIDs must be an array");
        return [];
    }

    if (videoIDs.length === 0) {
        console.log("ℹ️ Empty video ID array provided");
        return [];
    }

    // Handle specificVODs filter
    if (specificVODs !== undefined) {
        console.log("🎯 Using specific VODs filter");

        // Convert specificVODs to array and clean input
        const vodList = Array.isArray(specificVODs)
            ? specificVODs
            : specificVODs.split(',').map(id => id.trim()).filter(Boolean);

        if (vodList.length === 0) {
            console.log("⚠️ No valid VOD IDs provided in specificVODs");
            return [];
        }

        return vodList;
    }

    // Handle criteria-based filtering
    if (!criteria?.trim()) {
        console.log("ℹ️ No filtering criteria - processing all videos");
        return [...videoIDs]; // Return a copy to prevent mutations
    }

    console.log(`🔍 Applying filter criteria: ${criteria}`);

    switch (criteria.toLowerCase().trim()) {
        case 'latest':
            return [videoIDs[0]];

        case 'first':
            return [videoIDs[videoIDs.length - 1]];

        default:
            console.log(`⚠️ Unknown filter criteria: "${criteria}", processing all videos`);
            return [...videoIDs];
    }
}