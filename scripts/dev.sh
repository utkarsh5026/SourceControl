#!/bin/bash

# Development script for SourceControl CLI

set -e

echo "🚀 Starting development environment..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run in development mode with auto-restart
echo "🔄 Starting development server with auto-restart..."
npx concurrently \
    "npm run build:watch" \
    "npx nodemon --watch dist --exec 'node dist/cli.js'"