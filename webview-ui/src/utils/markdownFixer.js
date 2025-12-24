/**
 * Fixes nested code blocks in markdown content
 * When LLM outputs markdown that contains code blocks, the nested backticks break rendering
 * This function detects and fixes such cases by using longer fence delimiters
 */

/**
 * Fix nested code blocks by using 4-backtick fences when 3-backtick blocks are detected inside
 * @param {string} content - The markdown content to fix
 * @returns {string} - Fixed markdown content
 */
export function fixNestedCodeBlocks(content) {
  if (!content) return content;

  // Match code blocks with triple backticks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;

  let result = content;
  let match;
  const replacements = [];

  // Find all code blocks
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [fullMatch, language = "", innerContent] = match;
    const startIndex = match.index;

    // Check if this block contains nested triple backticks
    if (innerContent.includes("```")) {
      // Use 4 backticks for the outer fence
      const fixed = `\`\`\`\`${language}\n${innerContent}\`\`\`\``;
      replacements.push({
        start: startIndex,
        end: startIndex + fullMatch.length,
        original: fullMatch,
        replacement: fixed,
      });
    }
  }

  // Apply replacements in reverse order to maintain correct indices
  replacements.reverse().forEach(({ start, end, replacement }) => {
    result = result.substring(0, start) + replacement + result.substring(end);
  });

  return result;
}

/**
 * Alternative approach: Escape nested backticks
 * @param {string} content - The markdown content to fix
 * @returns {string} - Fixed markdown content
 */
export function escapeNestedBackticks(content) {
  if (!content) return content;

  const lines = content.split("\n");
  const result = [];
  let inCodeBlock = false;
  let codeBlockFence = null;
  let codeBlockContent = [];
  let codeBlockLanguage = "";

  let nestingDepth = 0;
  let inMarkerBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for marker block boundaries (Git conflict markers)
    // These indicate we are inside a file content block where ALL fences should be considered nested
    if (line.match(/^<{7}\s*(NEW FILE|SEARCH|REWRITE FILE|ORIGINAL)/)) {
      inMarkerBlock = true;
    } else if (line.match(/^>{7}\s*(NEW FILE|REPLACE|REWRITE FILE|UPDATED)/)) {
      inMarkerBlock = false;
    }

    // Check for code block fence (standalone or with language)
    // Match: ```lang or ``` or ````lang etc
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\w+)?/);

    if (fenceMatch && !inCodeBlock) {
      // Start of code block
      inCodeBlock = true;
      codeBlockFence = fenceMatch[1];
      codeBlockLanguage = fenceMatch[2] || "";
      codeBlockContent = [];
      nestingDepth = 0;

      // Check if there's content on the same line as the opening fence
      const contentAfterFence = line.substring(fenceMatch[0].length).trim();
      if (contentAfterFence) {
        codeBlockContent.push(contentAfterFence);
      }
    } else if (fenceMatch && inCodeBlock && fenceMatch[1] === codeBlockFence) {
      // We found a fence that matches our opening fence length/type

      const hasLanguage = !!fenceMatch[2];
      const hasContentAfter =
        line.substring(fenceMatch[0].length).trim().length > 0;

      // It's a nested start if:
      // 1. It has a language specifier (e.g. ```python)
      // 2. It has content on the same line
      // 3. We are inside a Marker Block (<<<<<<< ... >>>>>>>) -> Treat all fences as nested
      const isNestedStart = hasLanguage || hasContentAfter || inMarkerBlock;

      if (isNestedStart) {
        // Check if it's actually a closing fence for a nested block
        // If we are already nested (depth > 0) and it looks like a plain fence...
        const looksLikePlainFence = !hasLanguage && !hasContentAfter;

        if (looksLikePlainFence && nestingDepth > 0) {
          // It closes a nested block
          nestingDepth--;
          codeBlockContent.push(line);
        } else {
          // It starts a new nested block
          nestingDepth++;
          codeBlockContent.push(line);
        }
      } else {
        // This looks like a plain closing fence (```) outside of a marker block
        if (nestingDepth > 0) {
          // It closes a nested block
          nestingDepth--;
          codeBlockContent.push(line);
        } else {
          // It closes OUR block
          const content = codeBlockContent.join("\n");

          if (content.includes("```")) {
            // Use longer fence
            const fenceLength = Math.max(4, codeBlockFence.length + 1);
            const newFence = "`".repeat(fenceLength);
            result.push(`${newFence}${codeBlockLanguage}`);
            result.push(content);
            result.push(newFence);
          } else {
            // No nested backticks, keep original
            result.push(`${codeBlockFence}${codeBlockLanguage}`);
            result.push(content);
            result.push(codeBlockFence);
          }

          inCodeBlock = false;
          codeBlockFence = null;
          codeBlockContent = [];
          codeBlockLanguage = "";
          nestingDepth = 0;
        }
      }
    } else if (inCodeBlock) {
      // Inside code block
      codeBlockContent.push(line);
    } else {
      // Outside code block
      result.push(line);
    }
  }

  // Handle unclosed code block
  if (inCodeBlock) {
    result.push(`${codeBlockFence}${codeBlockLanguage}`);
    result.push(...codeBlockContent);
    result.push(codeBlockFence);
  }

  return result.join("\n");
}

/**
 * Main function to fix message content
 * Tries the escaping approach first as it's more reliable
 */
export function fixMessageContent(content) {
  if (!content) return content;

  console.log("[MarkdownFixer] Input length:", content.length);
  console.log("[MarkdownFixer] Has triple backticks:", content.includes("```"));

  // Use the line-by-line approach which is more accurate
  const fixed = escapeNestedBackticks(content);

  console.log("[MarkdownFixer] Output length:", fixed.length);
  console.log("[MarkdownFixer] Has 4 backticks:", fixed.includes("````"));
  console.log("[MarkdownFixer] Changed:", content !== fixed);

  return fixed;
}
