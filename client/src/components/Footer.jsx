import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import './Footer.css'

function Footer() {
  const [siteConfig, setSiteConfig] = useState({
    footer_title: 'Almacenes, Galpones, Espacios Libres',
    footer_text: 'Plataforma de intermediacion tecnologica para alquiler de espacios en Bolivia',
    footer_copyright_text: '2025 Almacenes, Galpones, Espacios Libres - Intermediario Tecnologico - Bolivia',
    footer_disclaimer_text: 'Esta plataforma NO es propietaria de los espacios y NO es parte del contrato de alquiler.'
  })

  useEffect(() => {
    api.get('/contact/site-config')
      .then(r => setSiteConfig(prev => ({ ...prev, ...r.data })))
      .catch(() => {})
    api.get('/spaces/config/homepage')
      .then(r => {
        if (r.data.footer_copyright_text) {
          setSiteConfig(prev => ({
            ...prev,
            footer_copyright_text: r.data.footer_copyright_text,
            footer_disclaimer_text: r.data.footer_disclaimer_text
          }))
        }
      })
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
          <p>{siteConfig.footer_copyright_text}</p>
          <p className="disclaimer">
            {siteConfig.footer_disclaimer_text}
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
