#!/bin/bash

# Build script for SourceControl CLI

set -e

echo "🧹 Cleaning previous build..."
npm run clean

echo "🔍 Type checking..."
npx tsc --noEmit

echo "📦 Building project..."
npm run build

echo "✅ Making CLI executable..."
chmod +x dist/cli.js

echo "🎉 Build completed successfully!"
echo ""
echo "You can now run the CLI with:"
echo "  node dist/cli.js --help"
echo ""
echo "Or install globally with:"
echo "  npm install -g ."