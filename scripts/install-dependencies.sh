#!/bin/bash

echo "Installing dependencies for Spotify to MP3 Converter..."

# Detect OS
if [ -f /etc/os-release ]; then
    # Linux
    . /etc/os-release
    OS=$NAME
elif [ "$(uname)" == "Darwin" ]; then
    # macOS
    OS="macOS"
elif [ "$(expr substr $(uname -s) 1 5)" == "MINGW" ] || [ "$(expr substr $(uname -s) 1 10)" == "MSYS_NT-10" ]; then
    # Windows
    OS="Windows"
else
    OS="Unknown"
fi

echo "Detected OS: $OS"

# Install dependencies based on OS
if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
    echo "Installing for Ubuntu/Debian..."
    sudo apt update
    sudo apt install -y ffmpeg
    sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
    sudo chmod a+rx /usr/local/bin/yt-dlp
elif [[ "$OS" == "macOS" ]]; then
    echo "Installing for macOS..."
    if ! command -v brew &> /dev/null; then
        echo "Homebrew not found. Please install Homebrew first: https://brew.sh/"
        exit 1
    fi
    brew install ffmpeg yt-dlp
elif [[ "$OS" == "Windows" ]]; then
    echo "Installing for Windows..."
    if command -v choco &> /dev/null; then
        choco install ffmpeg yt-dlp
    else
        echo "Chocolatey not found. Please install manually:"
        echo "1. FFmpeg: https://ffmpeg.org/download.html"
        echo "2. yt-dlp: https://github.com/yt-dlp/yt-dlp/releases"
    fi
else
    echo "Unsupported OS. Please install dependencies manually:"
    echo "1. FFmpeg: https://ffmpeg.org/download.html"
    echo "2. yt-dlp: https://github.com/yt-dlp/yt-dlp/releases"
fi

# Verify installation
echo "Verifying installation..."

if command -v ffmpeg &> /dev/null; then
    echo "✅ FFmpeg is installed"
else
    echo "❌ FFmpeg installation failed"
fi

if command -v yt-dlp &> /dev/null; then
    echo "✅ yt-dlp is installed"
    yt-dlp --version
else
    echo "❌ yt-dlp installation failed"
fi

echo "Installation complete!"
