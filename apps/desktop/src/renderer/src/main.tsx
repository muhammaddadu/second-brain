import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Registers the mermaid diagram renderer into the registry before the editor mounts (E7).
import './diagrams/mermaid';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
