#!/bin/bash
set -e

# Create Lambda Layer with dependencies

echo "🔨 Creating Lambda Layer for dependencies..."

cd ../layers/dependencies

# Create python directory structure for Lambda Layer
mkdir -p python/lib/python3.11/site-packages

# Install dependencies
pip install -r requirements.txt -t python/lib/python3.11/site-packages/

echo "✅ Layer dependencies installed!"
echo "📦 Layer will be packaged automatically during SAM build"
