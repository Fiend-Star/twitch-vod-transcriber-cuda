import * as tf from 'https://esm.sh/@tensorflow/tfjs@latest';
import * as use from 'https://esm.sh/@tensorflow-models/universal-sentence-encoder';

// Types
export interface RawChapter {
  start_time: number;
  end_time: number;
  content: string;
}

// Initialize TensorFlow with error handling
let modelInitialized = false;
let useModel: any = null;

async function initializeModel() {
  if (modelInitialized) return;
  
  try {
    await tf.setBackend('cpu');
    await tf.ready();
    useModel = await use.load();
    modelInitialized = true;
    console.log("✅ TensorFlow model initialized successfully");
  } catch (error) {
    console.warn("⚠️ Failed to initialize TensorFlow model, falling back to basic summarization", error);
    modelInitialized = false;
  }
}

/**
 * Generates a "book-like" title for a chapter.
 */
export function generateChapterTitle(content: string, summary: string): string {
  const sentences = content.split(/(?<=[.!?])\s+/);
  let candidate = sentences[0]?.trim() || summary;

  // Title-case each word with improved handling
  candidate = candidate
    .split(" ")
    .map((word) => {
      if (word.length === 0) return "";
      const lowerCaseWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in'];
      if (lowerCaseWords.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");

  // Ensure first word is always capitalized
  candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);

  if (candidate.length > 60) {
    const truncated = candidate.substring(0, 57);
    const lastSpace = truncated.lastIndexOf(' ');
    candidate = truncated.substring(0, lastSpace) + "...";
  }

  return candidate;
}

/**
 * Basic summarization fallback
 */
function basicSummarize(content: string, numSentences = 3): string {
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);
  
  const selectedSentences = sentences.slice(0, numSentences);
  return selectedSentences.map(s => `🔹 ${s.trim()}`).join('\n');
}

/**
 * Generates bullet point summary using TensorFlow if available
 */
export async function generateBulletPointSummary(
  content: string,
  numPoints: number = 3
): Promise<string> {
  if (!content?.trim()) {
    return "";
  }

  try {
    if (!modelInitialized) {
      await initializeModel();
    }

    if (!modelInitialized) {
      return basicSummarize(content, numPoints);
    }

    const sentences = content
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 0);

    if (sentences.length <= numPoints) {
      return sentences.map(s => `🔹 ${s.trim()}`).join('\n');
    }

    const embeddings = await useModel.embed(sentences);
    const embeddingsArray = await embeddings.array();
    
    // Simple extractive summarization using sentence embeddings
    const selectedSentences = [];
    const usedIndices = new Set();

    while (selectedSentences.length < numPoints && usedIndices.size < sentences.length) {
      let maxScore = -Infinity;
      let bestIndex = -1;

      for (let i = 0; i < sentences.length; i++) {
        if (usedIndices.has(i)) continue;

        let score = 0;
        for (let j = 0; j < sentences.length; j++) {
          if (i === j) continue;
          
          const similarity = cosineSimilarity(embeddingsArray[i], embeddingsArray[j]);
          score += similarity;
        }

        if (score > maxScore) {
          maxScore = score;
          bestIndex = i;
        }
      }

      if (bestIndex !== -1) {
        selectedSentences.push(sentences[bestIndex]);
        usedIndices.add(bestIndex);
      }
    }

    return selectedSentences.map(s => `🔹 ${s.trim()}`).join('\n');

  } catch (error) {
    console.warn("⚠️ Error in TensorFlow processing, using fallback summarization", error);
    return basicSummarize(content, numPoints);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Splits the transcript into chapters
 */
export function segmentTranscript(transcript: string): RawChapter[] {
  console.log("🔍 Splitting transcript into chapters...");
  
  const sentences = transcript
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => sentence.trim().length > 0);
  
  const chapters: RawChapter[] = [];
  let startTime = 0;
  let chunk: string[] = [];
  
  sentences.forEach((sentence, index) => {
    chunk.push(sentence.trim());
    
    if (chunk.length >= 5 || index === sentences.length - 1) {
      const chapterContent = chunk.join(" ").trim();
      
      if (chapterContent.length > 0) {
        chapters.push({
          start_time: startTime,
          end_time: startTime + chunk.length * 5,
          content: chapterContent
        });
        
        startTime += chunk.length * 5;
      }
      
      chunk = [];
    }
  });

  console.log(`✅ Total Chapters Created: ${chapters.length}`);
  return chapters;
}