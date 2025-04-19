#!/bin/bash

# Print commands for debugging
set -ex

# Create bin directory for executables
mkdir -p .vercel/bin

# Download yt-dlp binary
echo "Downloading yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o .vercel/bin/yt-dlp
chmod +x .vercel/bin/yt-dlp

# Verify the binary works
.vercel/bin/yt-dlp --version

# Add our bin directory to PATH
export PATH=$PATH:$(pwd)/.vercel/bin

# Run the normal build command
echo "Running normal build process..."
npm run build
