import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/layouts.css'
import './styles/screens.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ConnectServer } from './screens/connect'
import { initNative, needsServer } from './services/native'

// In the Android/iOS app, load the saved server address and login first.
void initNative().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode>{needsServer() ? <ConnectServer /> : <App />}</StrictMode>)
})
