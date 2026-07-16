const MAX_KEY_POINTS = 5;
const MAX_OVERVIEW_POINTS = 2;

const LABELS = {
  title: "Conversation Summary",
  generated: "Generated",
  overview: "Overview",
  keyPoints: "Key Points",
  actionItems: "Action Items",
  noActions: "No explicit action items detected.",
};

const ACTION_PATTERN = /\b(?:need to|should|must|will|please|todo|follow up|action)\b|(?:ต้อง|ควร|จะ|กรุณา|ติดตาม|ดำเนินการ)/i;

export async function summarizeConversation({ segments, generatedAt = new Date() }) {
  const normalizedSegments = getUniqueSegments(segments);

  if (normalizedSegments.length === 0) {
    throw new Error("There is no conversation to summarize.");
  }

  if (normalizedSegments.some((segment) => /[\u0E00-\u0E7F]/.test(segment))) {
    throw new Error("A complete English transcript is required before generating the summary.");
  }

  const keyPoints = selectEvenly(normalizedSegments, MAX_KEY_POINTS);
  const overview = keyPoints.slice(0, MAX_OVERVIEW_POINTS).join(" ");
  const actionItems = normalizedSegments.filter((segment) => ACTION_PATTERN.test(segment)).slice(0, 5);
  const actionMarkdown = actionItems.length > 0
    ? actionItems.map((item) => `- ${item}`).join("\n")
    : `- ${LABELS.noActions}`;

  return [
    `# ${LABELS.title}`,
    "",
    `> ${LABELS.generated}: ${generatedAt.toISOString()}`,
    "",
    `## ${LABELS.overview}`,
    "",
    overview,
    "",
    `## ${LABELS.keyPoints}`,
    "",
    ...keyPoints.map((point) => `- ${point}`),
    "",
    `## ${LABELS.actionItems}`,
    "",
    actionMarkdown,
  ].join("\n");
}

export function buildAiSummaryPackage({
  preliminarySummary = "",
  sourceSegments,
  translatedSegments = [],
  sourceLanguage,
  targetLanguage,
  generatedAt = new Date(),
}) {
  const sourceTranscript = formatNumberedSegments(sourceSegments);
  const translatedTranscript = formatNumberedSegments(translatedSegments);
  const reviewSummary = preliminarySummary
    ? demoteMarkdownHeadings(preliminarySummary)
    : "_No preliminary summary was generated. Build the final summary from the transcripts below._";

  return [
    "---",
    "document_type: conversation-summary-review",
    `source_language: ${sourceLanguage}`,
    `target_language: ${targetLanguage}`,
    `generated_at: ${generatedAt.toISOString()}`,
    "required_output_language: English",
    "---",
    "",
    "# Conversation Summary Review Package",
    "",
    "## Instructions for AI",
    "",
    "- Produce the final answer in English only.",
    "- Review the complete original transcript before relying on the preliminary summary.",
    "- Translate non-English content when needed.",
    "- Correct omissions, duplicated ideas, mistranslations, and unsupported conclusions.",
    "- Return: Executive Summary, Key Points, Decisions, Action Items, and Open Questions.",
    "- Clearly state when a decision, owner, deadline, or action item is not explicit in the transcript.",
    "",
    "## Preliminary English Summary",
    "",
    reviewSummary,
    "",
    `## Complete Original Transcript (${sourceLanguage})`,
    "",
    sourceTranscript || "_No original transcript available._",
    "",
    `## Available Translation (${targetLanguage})`,
    "",
    translatedTranscript || "_No translated transcript available._",
  ].join("\n");
}

function getUniqueSegments(segments) {
  const seen = new Set();

  return segments
    .map((segment) => segment.trim().replace(/\s+/g, " "))
    .filter((segment) => {
      const key = segment.toLocaleLowerCase();
      if (!segment || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function selectEvenly(segments, limit) {
  if (segments.length <= limit) {
    return segments;
  }

  const indexes = new Set();
  for (let index = 0; index < limit; index += 1) {
    indexes.add(Math.round((index * (segments.length - 1)) / (limit - 1)));
  }

  return [...indexes].map((index) => segments[index]);
}

function formatNumberedSegments(segments) {
  return segments
    .map((segment) => segment.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .map((segment, index) => `${index + 1}. ${segment}`)
    .join("\n");
}

function demoteMarkdownHeadings(markdown) {
  return markdown.replace(/^(#{1,4}) /gm, "##$1 ");
}
