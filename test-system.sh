#!/bin/bash

# System Testing Script
# Quick script to run comprehensive system tests

set -e

echo "🚀 VidShare System Testing Suite"
echo "================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp env.example .env
    echo "📝 Please edit .env file with your Supabase and Netlify credentials"
    echo "   Required variables:"
    echo "   - SUPABASE_URL"
    echo "   - SUPABASE_ANON_KEY"
    echo "   - NETLIFY_SITE_URL"
    exit 1
fi

# Check if environment variables are set
source .env
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ Missing required environment variables in .env file"
    echo "   Please set SUPABASE_URL and SUPABASE_ANON_KEY"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Parse command line arguments
ARGS=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --local)
            ARGS="$ARGS --local"
            echo "🏠 Testing LOCAL development environment"
            shift
            ;;
        --production)
            ARGS="$ARGS --production"
            echo "🌐 Testing PRODUCTION environment"
            shift
            ;;
        --skip-integration)
            ARGS="$ARGS --skip-integration"
            echo "⚡ Skipping integration tests (faster)"
            shift
            ;;
        --json)
            ARGS="$ARGS --json"
            shift
            ;;
        --help|-h)
            echo "Usage: ./test-system.sh [options]"
            echo ""
            echo "Options:"
            echo "  --local              Test local functions (requires netlify dev running)"
            echo "  --production         Test production deployment (default)"
            echo "  --skip-integration   Skip integration tests"
            echo "  --json               Output results as JSON"
            echo "  --help, -h           Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./test-system.sh                    # Run all tests against production"
            echo "  ./test-system.sh --local            # Run all tests against local dev server"
            echo "  ./test-system.sh --skip-integration # Skip integration tests"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Default to production if no environment specified
if [[ "$ARGS" != *"--local"* ]] && [[ "$ARGS" != *"--production"* ]]; then
    ARGS="$ARGS --production"
    echo "🌐 Testing PRODUCTION environment (default)"
fi

echo ""

# Run the comprehensive test suite
node tests/run-all-tests.js $ARGS

# Capture exit code
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "🎉 All tests passed! Your system is fully operational."
else
    echo "❌ Some tests failed. Please review the output above."
fi

exit $EXIT_CODE
