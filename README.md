# Tinker - Open Source Coding Agent

**Bring Your Own Key (BYOK)** - An open-source AI coding assistant for VS Code.

![Tinker Logo](media/tinker-logo-v2.png)

## Features

- 🤖 **Multi-Provider Support** - OpenAI, Anthropic, Google Gemini, and Azure OpenAI
- 🔑 **Secure API Key Storage** - Keys stored in VS Code's encrypted secret storage
- 💬 **Chat Interface** - Modern chat UI with markdown and code highlighting
- 📁 **Context-Aware** - Add files and symbols to your prompts with `#` and `@`
- 🖼️ **Image Support** - Drag & drop or paste images for vision models
- 🔧 **Tool Integration** - File operations, code search, and more
- 🎨 **Theme Support** - Works with both light and dark VS Code themes
- ⚡ **Responses API** - Optional support for OpenAI's Responses API

## Getting Started

1. Open the Tinker sidebar from the Activity Bar
2. Click the settings icon to configure your API key
3. Select your preferred provider and model
4. Start chatting!

## Keyboard Shortcuts

- `#` - Add a file to context
- `@` - Add a symbol to context  
- `Cmd+L` / `Ctrl+L` - Add current selection to context
- `Enter` - Send message
- `Shift+Enter` - New line

## Extension Settings

This extension contributes the following settings:

* `tinker.provider` - Active AI provider (openai, anthropic, gemini, azure)
* `tinker.model` - Selected model for the active provider
* `tinker.customModels` - Custom models per provider

## Requirements

- VS Code 1.106.0 or higher
- Valid API key for your chosen provider

## Privacy

API keys are stored securely in VS Code's encrypted secret storage and are never transmitted except to the provider you configure.

## Release Notes

### 0.0.1

Initial release:
- Multi-provider support (OpenAI, Anthropic, Gemini, Azure)
- Chat interface with code highlighting
- File and symbol context
- Image attachments
- Light and dark theme support

---

**Enjoy coding with Tinker!** 🛠️
