# MCP Configurator

A desktop application for managing Model Context Protocol (MCP) server configurations with a user-friendly interface.

![Configurator Icon](react-app/assets/configurator-icon1.png)

## Features

- Visual editor for MCP server configurations
- Automatic configuration backups
- Native desktop integration
- Real-time validation

## Development Setup

1. Install dependencies:
```bash
cd react-app
npm install
```

2. Start development server:
```bash
npm start
```

3. For Electron development:
```bash
npm run electron-dev
```

## Building

Build the application:
```bash
cd react-app
npm run build
```

This will create:
- Web build in `react-app/build`
- Electron build with main and preload scripts

## Project Structure

- `/react-app` - Main application code
  - `/src` - React source files
  - `/electron` - Electron integration
  - `/config-backups` - Historical configurations
  - `/build` - Compiled application

## Configuration

The application manages MCP server configurations in JSON format:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["path/to/server"],
      "env": {
        "API_KEY": "value"
      }
    }
  }
}
```

## Architecture

For detailed architecture documentation and implementation details, see [.context/index.md](.context/index.md).
