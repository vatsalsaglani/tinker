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

// Run Command Schema
const runCommandSchema = z.object({
  reason: reasonField,
  command: z.string().describe("The shell command to execute"),
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
  run_command: runCommandSchema,
};

module.exports = {
  toolDefinitions,
  toolSchemas,
  zodToOpenAIFunction,
};
