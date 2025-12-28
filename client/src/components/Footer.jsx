import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import './Footer.css'

function Footer() {
  const [siteConfig, setSiteConfig] = useState({
    footer_title: 'Almacenes, Galpones, Espacios Libres',
    footer_text: 'Plataforma de intermediacion tecnologica para alquiler de espacios en Bolivia'
  })

  useEffect(() => {
    api.get('/contact/site-config')
      .then(r => setSiteConfig(prev => ({ ...prev, ...r.data })))
      .catch(() => {})
  }, [])

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>{siteConfig.footer_title}</h3>
            <p>{siteConfig.footer_text}</p>
          </div>
          
          <div className="footer-section">
            <h4>Legal</h4>
            <ul>
              <li><Link to="/legal/aviso-legal">Aviso Legal</Link></li>
              <li><Link to="/legal/terminos">Terminos y Condiciones</Link></li>
              <li><Link to="/legal/privacidad">Privacidad</Link></li>
              <li><Link to="/legal/pagos-reembolsos">Pagos y Reembolsos</Link></li>
            </ul>
          </div>
          
          <div className="footer-section">
            <h4>Informacion</h4>
            <ul>
              <li><Link to="/legal/intermediacion">Intermediacion</Link></li>
              <li><Link to="/legal/anti-bypass">Clausula Anti-Bypass</Link></li>
              <li><Link to="/contacto">Contactar</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>2025 {siteConfig.footer_title} - Intermediario Tecnologico - Bolivia</p>
          <p className="disclaimer">
            Esta plataforma NO es propietaria de los espacios y NO es parte del contrato de alquiler.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
