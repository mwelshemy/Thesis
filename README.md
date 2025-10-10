# VS Code AI Extension

A powerful VS Code extension that combines AI-powered code understanding with intelligent search capabilities.

## ✨ Features

- **🤖 AI Code Explanation**: Get intelligent explanations for selected code or entire files
- **🔍 Smart Project Search**: Search across your entire project with context-aware results
- **📄 File Summarization**: AI-powered summaries of code files
- **🔄 Real-time Indexing**: Automatic file indexing with change detection
- **🎯 Integrated Workflow**: Combine search results with AI analysis for better insights

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or later
- VS Code 1.82.0 or later
- Hugging Face API token (optional - mock mode available)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd thesis
   ```

Install dependencies

bash
npm install
Set up environment variables (optional for real AI)

bash

# Copy the example file

cp .env.example .env

# Add your Hugging Face token

echo "HUGGINGFACE_API_TOKEN=your_token_here" >> .env
Compile the extension

bash
npm run compile
Run in development mode

Press F5 in VS Code to open Extension Development Host

Or use: code --extensionDevelopmentPath=$(pwd)

Using the Extension
Open Command Palette (Ctrl+Shift+P or Cmd+Shift+P)

Try these commands:

VS AI: Ask AI: Explain Code - Explain selected code or current file

VS AI: Search Project - Search across all project files

VS AI: Summarize File - Get AI summary of current file

VS AI: Build Search Index - Manually rebuild search index

VS AI: Search Statistics - View indexing statistics

🛠 Development
Project Structure
text
thesis/
├── src/
│ ├── extension.ts # Main extension entry point
│ └── search.ts # Search and indexing functionality
├── ai/
│ └── callAI.ts # AI integration with Hugging Face
├── tests/
│ └── integration/ # Integration tests
├── out/ # Compiled JavaScript
└── package.json # Extension manifest
Available Scripts
bash

# Build and compile

npm run compile # Compile TypeScript
npm run watch # Watch mode for development

# Testing

npm run test:integration # Run integration tests
npm run test:basic # Run basic functionality tests
npm run test:workflows # Run workflow scenario tests

# Code quality

npm run lint # ESLint check
npm run lint:fix # ESLint auto-fix
Key Components
AI Module (ai/callAI.ts)
Handles Hugging Face API communication

Provides fallback mock responses

Error handling and token management

Search Module (src/search.ts)
File indexing and real-time updates

Content-based search with relevance scoring

File change detection and auto-reindexing

Extension Core (src/extension.ts)
VS Code command registration

User interface and output channels

Workflow orchestration

🔧 Configuration
Environment Variables
Create a .env file in the root directory:

bash
HUGGINGFACE_API_TOKEN=your_hugging_face_token_here
Extension Settings
The extension can be configured through VS Code settings:

vsAi.maxSearchResults: Maximum search results to display (default: 20)

vsAi.autoIndex: Automatically rebuild index on file changes (default: true)

vsAi.aiModel: Hugging Face model to use (default: 'bigcode/starcoder')

🔄 Integration Testing
Testing AI + Search Integration
We have comprehensive integration tests to verify that AI and Search components work together:

bash

# Run all integration tests

npm run test:integration

# Test specific workflows

npm run test:workflows
npm run test:basic
Test Scenarios Covered
AI with Search Context: AI explanations using project knowledge

Search-Driven Analysis: AI analysis of search results

User Workflows: Complete extension command flows

Error Handling: Graceful failure modes

Performance: Reasonable response times

Integration Architecture
See docs/INTEGRATION-ARCHITECTURE.md for detailed documentation on how components interact.

🐛 Troubleshooting
Common Issues
"AI call failed" error

Check your Hugging Face API token in .env

Verify internet connection

Use mock mode for testing without token

Search not returning results

Run "VS AI: Build Search Index" command

Check file permissions

Verify supported file types

Extension not loading

Run npm run compile to rebuild

Check VS Code Developer Console for errors

Verify Node.js version compatibility

Debugging
Open Developer Tools in Extension Development Host

Check Output Channels:

"VS AI" - AI responses and errors

"VS Search" - Search indexing and results

Enable verbose logging in extension settings

📈 Performance
Search Indexing: Initial index build for 1000 files ~2-5 seconds

AI Responses: With API token ~3-10 seconds, Mock mode ~100ms

Memory Usage: Index typically uses 10-50MB depending on project size

🤝 Contributing
Fork the repository

Create a feature branch: git checkout -b feature/amazing-feature

Commit changes: git commit -m 'Add amazing feature'

Push to branch: git push origin feature/amazing-feature

Open a Pull Request

Development Workflow
Start development:

bash
npm install
npm run watch
Press F5 to open Extension Development Host

Run tests:

bash
npm run test:integration
Code quality:

bash
npm run lint
