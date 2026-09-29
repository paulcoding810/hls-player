import React from 'react'
import ReactDOM from 'react-dom/client'

import '../index.css'
import Catalog from './Catalog'

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <Catalog />
  </React.StrictMode>,
)
