import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import RoomPage from './RoomPage.jsx'
import AdminPage from './AdminPage.jsx'
import { roomKeyFromHost } from './lib/registry.js'

// Router: /admin -> dashboard; <room> path/subdomain -> room page; else landing.
const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin'
const room = isAdmin ? null : roomKeyFromHost()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAdmin ? <AdminPage /> : room ? <RoomPage room={room} /> : <App />}
  </StrictMode>,
)