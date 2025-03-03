import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ConfigEditor from './config-editor.tsx';

console.log('Starting application...');

const container = document.getElementById('root');
if (!container) {
  console.error('Root element not found');
  throw new Error('Failed to find the root element');
}

console.log('Root element found, creating root...');
const root = createRoot(container);

console.log('Rendering application...');
root.render(
  <React.StrictMode>
    <ConfigEditor />
  </React.StrictMode>
);
console.log('Application rendered');
