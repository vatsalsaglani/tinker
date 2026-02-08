const { z } = require("zod");

/**
 * Tool schemas using Zod (like Pydantic in Python)
 * These define the input validation for each tool
 */

// Common reason field that all tools must have
const reasonField = z
  .string()
  .describe(
    "Brief explanation of why you are calling this tool and what you expect to find/accomplish"
  );

// Grep Search Schema
const grepSearchSchema = z.object({
  reason: reasonField,
  pattern: z.string().describe("The search pattern (supports regex)"),
  file_pattern: z
    .string()
    .optional()
    .describe("File pattern to search in (glob pattern)"),
  case_insensitive: z
    .boolean()
    .default(false)
    .describe("Whether to perform case-insensitive search"),
  max_results: z
    .number()
    .default(50)
    .describe("Maximum number of results to return"),
});

// Read File Schema
const readFileSchema = z.object({
  reason: reasonField,
  file_path: z.string().describe("Path to the file relative to workspace root"),
  start_line: z
    .number()
    .optional()
    .describe("Starting line number (1-indexed)"),
  end_line: z.number().optional().describe("Ending line number (1-indexed)"),
});

// Read Multiple Files Schema
const readMultipleFilesSchema = z.object({
  reason: reasonField,
  file_paths: z
    .array(z.string())
    .describe("Array of file paths relative to workspace root"),
});

// Get File Tree Schema
const getFileTreeSchema = z.object({
  reason: reasonField,
  max_depth: z.number().default(5).describe("Maximum depth to traverse"),
  include_files: z
    .boolean()
    .default(true)
    .describe("Whether to include files in the tree"),
});

// List Files Schema
const listFilesSchema = z.object({
  reason: reasonField,
  pattern: z.string().describe("Glob pattern to match files"),
  max_results: z
    .number()
    .default(100)
    .describe("Maximum number of files to return"),
});

// Get File Info Schema
const getFileInfoSchema = z.object({
  reason: reasonField,
  file_path: z.string().describe("Path to the file relative to workspace root"),
});

// Get Diagnostics Schema
const getDiagnosticsSchema = z.object({
  reason: reasonField,
  file_path: z
    .string()
    .optional()
    .describe("Optional file path relative to workspace root"),
  severity: z
    .enum(["error", "warning", "info", "hint"])
    .optional()
    .describe("Optional severity filter"),
  max_results: z
    .number()
    .default(100)
    .describe("Maximum number of diagnostics to return"),
});

// Find Symbols Schema
const findSymbolsSchema = z.object({
  reason: reasonField,
  query: z.string().describe("Symbol query text"),
  max_results: z
    .number()
    .default(50)
    .describe("Maximum number of symbols to return"),
});

// Get File Outline Schema
const getFileOutlineSchema = z.object({
  reason: reasonField,
  file_path: z.string().describe("Path to file relative to workspace root"),
  max_depth: z
    .number()
    .default(8)
    .describe("Maximum symbol tree depth to include"),
});

// Go To Definition Schema
const goToDefinitionSchema = z.object({
  reason: reasonField,
  file_path: z.string().describe("Path to file relative to workspace root"),
  line: z.number().describe("1-indexed line number"),
  character: z
    .number()
    .default(1)
    .describe("1-indexed character position"),
  max_results: z
    .number()
    .default(20)
    .describe("Maximum number of definitions to return"),
});

// Find References Schema
const findReferencesSchema = z.object({
  reason: reasonField,
  file_path: z.string().describe("Path to file relative to workspace root"),
  line: z.number().describe("1-indexed line number"),
  character: z
    .number()
    .default(1)
    .describe("1-indexed character position"),
  include_declaration: z
    .boolean()
    .default(false)
    .describe("Whether to include symbol declaration in results"),
  max_results: z
    .number()
    .default(100)
    .describe("Maximum number of references to return"),
});

// Get Git Status Schema
const getGitStatusSchema = z.object({
  reason: reasonField,
  include_diff_stat: z
    .boolean()
    .default(false)
    .describe("Whether to include git diff --stat output"),
});

// Command type enum for better UI display
const commandTypeEnum = z.enum([
  "create_directory", // mkdir, md
  "create_file", // touch, new file
  "package_manager", // npm, yarn, pnpm, pip, go mod
  "git", // git commands
  "build", // make, cargo, gradle, mvn
  "test", // npm test, go test, pytest
  "inspect", // ls, cat, grep, find
  "shell", // generic shell command
]);

// Run Command Schema
const runCommandSchema = z.object({
  reason: reasonField,
  command: z.string().describe("The shell command to execute"),
  type: commandTypeEnum
    .optional()
    .describe(
      "The type of command: create_directory, create_file, package_manager, git, build, test, inspect, or shell"
    ),
  cwd: z
    .string()
    .optional()
    .describe("Working directory for the command (relative to workspace root)"),
  timeout: z
    .number()
    .default(30000)
    .describe("Maximum execution time in milliseconds (default: 30000)"),
});

/**
 * Convert Zod schema to OpenAI function calling format
 */
function zodToOpenAIFunction(name, description, schema) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: zodSchemaToProperties(schema),
        required: getRequiredFields(schema),
      },
    },
  };
}

function zodSchemaToProperties(schema) {
  const shape = schema.shape;
  const properties = {};

  for (const [key, value] of Object.entries(shape)) {
    // Unwrap for type determination
    let effectiveType = value;
    while (
      effectiveType.constructor.name === "ZodOptional" ||
      effectiveType.constructor.name === "ZodDefault" ||
      effectiveType.constructor.name === "ZodNullable"
    ) {
      effectiveType = effectiveType._def.innerType;
    }

    properties[key] = {
      type: getZodType(effectiveType),
      description: value.description || value._def.description || "",
    };

    // Add default if exists
    if (value.constructor.name === "ZodDefault") {
      properties[key].default = value._def.defaultValue;
    } else if (value._def.defaultValue !== undefined) {
      // Fallback for some Zod versions or specific types
      properties[key].default = value._def.defaultValue;
    }

    // Add array items if type is array
    if (effectiveType.constructor.name === "ZodArray") {
      properties[key].items = {
        type: getZodType(effectiveType._def.type || effectiveType._def.element),
      };
    }
  }

  return properties;
}

function getRequiredFields(schema) {
  const shape = schema.shape;
  const required = [];

  for (const [key, value] of Object.entries(shape)) {
    if (!value.isOptional() && value.constructor.name !== "ZodDefault") {
      required.push(key);
    }
  }

  return required;
}

function getZodType(zodType) {
  // Unwrap if needed (though usually passed unwrapped from zodSchemaToProperties)
  let type = zodType;
  while (
    type.constructor.name === "ZodOptional" ||
    type.constructor.name === "ZodDefault" ||
    type.constructor.name === "ZodNullable"
  ) {
    type = type._def.innerType;
  }

  const typeName = type.constructor.name;
  switch (typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodArray":
      return "array";
    case "ZodObject":
      return "object";
    default:
      return "string";
  }
}

// Export tool definitions
const toolDefinitions = [
  zodToOpenAIFunction(
    "grep_search",
    "Search for a pattern in files using grep. Returns matching lines with file paths and line numbers.",
    grepSearchSchema
  ),
  zodToOpenAIFunction(
    "read_file",
    "Read the contents of a specific file. Can read entire file or specific line ranges.",
    readFileSchema
  ),
  zodToOpenAIFunction(
    "read_multiple_files",
    "Read the contents of multiple files at once.",
    readMultipleFilesSchema
  ),
  zodToOpenAIFunction(
    "get_file_tree",
    "Get the file and directory structure of the workspace.",
    getFileTreeSchema
  ),
  zodToOpenAIFunction(
    "list_files",
    "List files matching a specific pattern.",
    listFilesSchema
  ),
  zodToOpenAIFunction(
    "get_file_info",
    "Get metadata about a file including size, last modified date, and number of lines.",
    getFileInfoSchema
  ),
  zodToOpenAIFunction(
    "get_diagnostics",
    "Get diagnostics (errors/warnings/info) from VS Code language services for a file or workspace.",
    getDiagnosticsSchema
  ),
  zodToOpenAIFunction(
    "find_symbols",
    "Find workspace symbols using VS Code symbol index.",
    findSymbolsSchema
  ),
  zodToOpenAIFunction(
    "get_file_outline",
    "Get symbol outline for a file (classes, functions, methods, etc.).",
    getFileOutlineSchema
  ),
  zodToOpenAIFunction(
    "go_to_definition",
    "Find symbol definitions at a specific file position.",
    goToDefinitionSchema
  ),
  zodToOpenAIFunction(
    "find_references",
    "Find references to a symbol at a specific file position.",
    findReferencesSchema
  ),
  zodToOpenAIFunction(
    "get_git_status",
    "Get git branch/status summary for the current workspace.",
    getGitStatusSchema
  ),
  zodToOpenAIFunction(
    "run_command",
    "Execute a shell command and return its output. Use for git, npm, build tools, etc. Avoid destructive commands.",
    runCommandSchema
  ),
];

// Export schemas for validation
const toolSchemas = {
  grep_search: grepSearchSchema,
  read_file: readFileSchema,
  read_multiple_files: readMultipleFilesSchema,
  get_file_tree: getFileTreeSchema,
  list_files: listFilesSchema,
  get_file_info: getFileInfoSchema,
  get_diagnostics: getDiagnosticsSchema,
  find_symbols: findSymbolsSchema,
  get_file_outline: getFileOutlineSchema,
  go_to_definition: goToDefinitionSchema,
  find_references: findReferencesSchema,
  get_git_status: getGitStatusSchema,
  run_command: runCommandSchema,
};

module.exports = {
  toolDefinitions,
  toolSchemas,
  zodToOpenAIFunction,
};
