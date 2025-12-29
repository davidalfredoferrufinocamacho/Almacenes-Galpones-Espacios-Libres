import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Header.css'

function Header() {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/')
    setMenuOpen(false)
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="header">
      <div className="container header-content">
        <Link to="/" className="logo" onClick={closeMenu}>
          <h1>Almacenes, Galpones, Espacios Libres</h1>
        </Link>
        
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? '✕' : '☰'}
        </button>
        
        <nav className={`nav ${menuOpen ? 'open' : ''}`}>
          <Link to="/espacios" onClick={closeMenu}>Espacios</Link>
          {isAuthenticated ? (
            <>
              {user?.role === 'GUEST' && (
                <Link to="/cliente" onClick={closeMenu}>Portal del Cliente</Link>
              )}
              {user?.role === 'HOST' && (
                <Link to="/propietario" onClick={closeMenu}>Portal del Propietario</Link>
              )}
              {user?.role === 'ADMIN' && (
                <Link to="/admin" onClick={closeMenu}>Admin</Link>
              )}
              <button onClick={handleLogout} className="btn-logout">
                Salir
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-login" onClick={closeMenu}>Ingresar</Link>
              <Link to="/registro" className="btn btn-primary" onClick={closeMenu}>Registrarse</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Header
