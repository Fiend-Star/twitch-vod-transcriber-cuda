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
    });

    const { code, stdout, stderr } = await cmd.output();

    if (stdout) {
        const output = new TextDecoder().decode(stdout);
        output.split('\n').forEach(line => {
            if (line.includes('[download]')) {
                console.log(line);
            }
        });
    }

    if (stderr) {
        console.error(new TextDecoder().decode(stderr));
    }

    return code;
}

export function filterVideoIDs(
    videoIDs: string[],
    criteria?: string | undefined,
    specificVODs?: string[] | string | undefined
): string[] {
    // Handle specificVODs input
    if (specificVODs) {
        console.log("🎯 Using specific VODs filter");

        // Convert specificVODs to array if it's a string
        const vodList = Array.isArray(specificVODs)
            ? specificVODs
            : specificVODs.split(',').map(id => id.trim());

        // Filter out any invalid or non-existent VOD IDs
        const filteredList = vodList.filter(id => {
            const isValid = videoIDs.includes(id);
            if (!isValid) {
                console.log(`⚠️ VOD ID not found: ${id}`);
            }
            return isValid;
        });

        console.log(`Found ${filteredList.length} out of ${vodList.length} requested VODs`);
        return filteredList;
    }

    // If no filter criteria and no specific VODs, apply no filtering
    if (!criteria?.trim()) {
        console.log("ℹ️ No filtering applied - processing all videos");
        return videoIDs;
    }

    // Apply filter criteria if provided
    console.log(`🔍 Applying filter criteria: ${criteria}`);

    switch (criteria.toLowerCase()) {
        case 'latest':
            if (videoIDs.length === 0) return [];
            return [videoIDs[0]]; // Only return the most recent video

        case 'first':
            if (videoIDs.length === 0) return [];
            return [videoIDs[videoIDs.length - 1]]; // Return the oldest video

        case 'even':
            return videoIDs.filter(id => {
                const num = parseInt(id);
                return !isNaN(num) && num % 2 === 0;
            });

        case 'odd':
            return videoIDs.filter(id => {
                const num = parseInt(id);
                return !isNaN(num) && num % 2 !== 0;
            });

        default:
            console.log("⚠️ Unknown filter criteria, processing all videos");
            return videoIDs;
    }
}