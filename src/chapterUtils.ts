/**
 * Generates a “book-like” title for a chapter.
 * For now, it simply uses the first sentence of the chapter,
 * capitalizing each word. You could enhance this with a more creative approach.
 */
export function generateChapterTitle(content: string, summary: string): string {
  // Split the content into sentences (you might want to refine the regex)
  const sentences = content.split(/[.?!]\s+/);
  let candidate = sentences[0] || summary; // fallback to summary if needed

  // Title-case each word (this is a simple approach; adjust as needed)
  candidate = candidate
    .split(" ")
    .map((word) =>
      word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""
    )
    .join(" ");

  // Optionally, limit the title’s length (here to 60 characters)
  if (candidate.length > 60) {
    candidate = candidate.substring(0, 60).trim() + "...";
  }
  return candidate;
}

export function summariseText(content: string): string {
  return content.length > 500 ? content.slice(0, 500) + "..." : content;
}


export function segmentTranscript(transcript: string): Array<{ start_time: number; end_time: number; content: string }> {
  console.log("🔍 Splitting transcript into chapters...");

  const sentences = transcript.split(". ");
  const chapters: Array<{ start_time: number; end_time: number; content: string }> = [];
  let startTime = 0;
  let chunk: string[] = [];

  sentences.forEach((sentence, index) => {
    chunk.push(sentence);
    if (chunk.length >= 5 || index === sentences.length - 1) {
      const chapterContent = chunk.join(". ");
      console.log(`📝 Created Chapter ${chapters.length + 1}: ${chapterContent.substring(0, 50)}...`);

      chapters.push({
        start_time: startTime,
        end_time: startTime + chunk.length * 5, // Assume 5 seconds per sentence
        content: chapterContent
      });

      startTime += chunk.length * 5;
      chunk = [];
    }
  });

  console.log(`✅ Total Chapters Created: ${chapters.length}`);
  return chapters;
}
