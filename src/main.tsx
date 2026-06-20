import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Test if React is mounting
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
