import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import RoomPage from './RoomPage.jsx'
import { roomKeyFromHost } from './lib/registry.js'

// Subdomain router: xxx.mc.zenithurl.com -> room page; everything else -> landing.
const room = roomKeyFromHost()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {room ? <RoomPage room={room} /> : <App />}
  </StrictMode>,
)