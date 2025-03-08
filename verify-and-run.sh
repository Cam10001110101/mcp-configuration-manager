#!/bin/bash

echo "Checking build structure..."
BUILD_DIR="build/electron"
PRELOAD_PATH="$BUILD_DIR/preload.js"
MAIN_PATH="$BUILD_DIR/main.js"

if [ ! -d "$BUILD_DIR" ]; then
    echo "Creating build directory..."
    mkdir -p "$BUILD_DIR"
fi

echo "Compiling TypeScript files..."
npx tsc -p electron/tsconfig.json

if [ -f "$PRELOAD_PATH" ]; then
    echo "Preload script exists at: $PRELOAD_PATH"
else
    echo "Error: Preload script not found at: $PRELOAD_PATH"
    exit 1
fi

if [ -f "$MAIN_PATH" ]; then
    echo "Main script exists at: $MAIN_PATH"
else
    echo "Error: Main script not found at: $MAIN_PATH"
    exit 1
fi

echo "Starting Electron..."
export NODE_ENV='production'
./node_modules/.bin/electron .
