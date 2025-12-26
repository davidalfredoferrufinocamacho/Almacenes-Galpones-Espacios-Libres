import { Link } from 'react-router-dom'
import './Footer.css'

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Almacenes, Galpones, Espacios Libres</h3>
            <p>Plataforma de intermediacion tecnologica para alquiler de espacios en Bolivia</p>
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
          <p>2025 Almacenes, Galpones, Espacios Libres - Intermediario Tecnologico - Bolivia</p>
          <p className="disclaimer">
            Esta plataforma NO es propietaria de los espacios y NO es parte del contrato de alquiler.
          </p>
        </div>
      </div>
    </footer>
  )
}

export default Footer
