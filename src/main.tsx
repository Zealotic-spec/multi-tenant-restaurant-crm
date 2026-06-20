import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ClientPortal from './ClientPortal.tsx';
import './index.css';

// Универсальный клиентский портал живёт по /portal/<api_key> — один и тот же бандл
// обслуживает любой ресторан-tenant; конкретное заведение определяется ключом из URL,
// а не отдельной копией сайта. server.ts отдаёт index.html на любой неизвестный путь
// (SPA fallback), поэтому прямой переход по этой ссылке тоже работает.
const portalMatch = window.location.pathname.match(/^\/portal\/([^/?#]+)/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {portalMatch ? <ClientPortal apiKey={decodeURIComponent(portalMatch[1])} /> : <App />}
  </StrictMode>,
);
