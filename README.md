# Tinker - Open Source Coding Agent

**Bring Your Own Key (BYOK)** - An open-source AI coding assistant for VS Code.

![Tinker Logo](media/tinker-logo-v2.png)

## Features

- 🤖 **Multi-Provider Support** - OpenAI, Anthropic, Google Gemini, Azure OpenAI, and Amazon Bedrock
- 🔑 **Secure API Key Storage** - Keys stored in VS Code's encrypted secret storage
- 💬 **Chat Interface** - Modern chat UI with markdown and syntax-highlighted code blocks
- 📁 **Context-Aware** - Add files and symbols to your prompts with `#` and `@`
- 🖼️ **Image Support** - Drag & drop or paste images for vision models
- 🔧 **Tool Integration** - File operations, code search, and more
- 🎨 **Theme Support** - Works with both light and dark VS Code themes
- ⚡ **Responses API** - Optional support for OpenAI's Responses API
- 🌐 **VS Code Fork Compatible** - Works with Cursor, Kiro, Antigravity, and other forks

## Supported Providers

| Provider | Auth Method | Models |
|----------|-------------|--------|
| **OpenAI** | API Key | GPT-4o, GPT-4, o1, etc. |
| **Anthropic** | API Key | Claude Sonnet 4, Claude 3.5, etc. |
| **Google Gemini** | API Key | Gemini 2.0 Flash, Gemini 1.5 Pro, etc. |
| **Azure OpenAI** | API Key + Endpoint | GPT-4, GPT-3.5 Turbo, etc. |
| **Amazon Bedrock** | AWS Credentials | Claude models via Bedrock |

## Getting Started

1. Open the Tinker sidebar from the Activity Bar
2. Click the settings icon to configure your API key
3. Select your preferred provider and model
4. Start chatting!

### Configuring Amazon Bedrock

For Bedrock, you'll need AWS credentials instead of an API key:
1. Go to the Config Panel (gear icon)
2. Select "Bedrock" as your provider
3. Enter your AWS Access Key ID, Secret Access Key, and Region
4. Save credentials - they're stored securely in VS Code's encrypted storage

## Keyboard Shortcuts

- `#` - Add a file to context
- `@` - Add a symbol to context  
- `Cmd+L` / `Ctrl+L` - Add current selection to context
- `Enter` - Send message
- `Shift+Enter` - New line

## Extension Settings

This extension contributes the following settings:

* `tinker.provider` - Active AI provider (openai, anthropic, gemini, azure, bedrock)
* `tinker.model` - Selected model for the active provider
* `tinker.customModels` - Custom models per provider
* `tinker.azureEndpoint` - Azure OpenAI endpoint URL
* `tinker.awsRegion` - AWS region for Bedrock

## Requirements

- VS Code 1.85.0 or higher (compatible with VS Code forks)
- Valid API key or credentials for your chosen provider

## Privacy

API keys and AWS credentials are stored securely in VS Code's encrypted secret storage and are never transmitted except to the provider you configure.

## Release Notes

See [full changelog](#release-notes) for all versions.

### 0.0.4

- 🔧 **VS Code Fork Compatibility Fix** - Improved secret storage with fallback to globalState for better compatibility with Cursor, Kiro, and other VS Code forks
- 📝 **AWS Region Input** - Changed from dropdown to text input for flexibility with any AWS region
- 🧹 **Production Ready** - Disabled debug file logging by default for cleaner production builds
- ⚙️ **Configuration Fix** - Added `awsRegion` to registered configuration settings

### 0.0.3

- 🔐 **Improved Credential Storage** - Better handling of Bedrock AWS credentials on extension load
- 🐛 **Bug Fixes** - Fixed credential loading for Bedrock provider initialization

### 0.0.2

- ☁️ **Amazon Bedrock Support** - Access Claude models via AWS Bedrock with IAM credentials
- 🎨 **Improved Code Blocks** - Sleek, modern styling for all code blocks with syntax highlighting
- 💭 **Inline Thinking Indicator** - Animated thinking indicator shown directly in chat messages
- 🔄 **Better Streaming** - Fixed code block rendering during streaming responses
- 🌐 **VS Code Fork Compatibility** - Lowered version requirement to 1.85.0 for better compatibility

### 0.0.1

Initial release:
- Multi-provider support (OpenAI, Anthropic, Gemini, Azure)
- Chat interface with code highlighting
- File and symbol context
- Image attachments
- Light and dark theme support

---

**Enjoy coding with Tinker!** 🛠️
