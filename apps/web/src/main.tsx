import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { consumeChallengeFromUrl } from './share/intake';
import { useGameStore } from './store';

const challenge = consumeChallengeFromUrl();
if (challenge) useGameStore.getState().setChallenge(challenge);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
