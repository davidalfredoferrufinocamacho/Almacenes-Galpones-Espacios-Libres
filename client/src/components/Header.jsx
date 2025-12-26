import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Header.css'

function Header() {
  const { user, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="header">
      <div className="container header-content">
        <Link to="/" className="logo">
          <h1>AlmacenesBO</h1>
        </Link>
        
        <nav className="nav">
          <Link to="/espacios">Espacios</Link>
          {isAuthenticated ? (
            <>
              <Link to="/dashboard">Mi Panel</Link>
              {user?.role === 'HOST' && (
                <Link to="/mis-espacios">Mis Espacios</Link>
              )}
              {user?.role === 'GUEST' && (
                <Link to="/mis-reservaciones">Reservaciones</Link>
              )}
              {user?.role === 'ADMIN' && (
                <Link to="/admin">Admin</Link>
              )}
              <button onClick={handleLogout} className="btn-logout">
                Salir
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-login">Ingresar</Link>
              <Link to="/registro" className="btn btn-primary">Registrarse</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Header
