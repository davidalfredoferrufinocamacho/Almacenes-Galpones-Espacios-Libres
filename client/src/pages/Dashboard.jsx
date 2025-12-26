import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import './Dashboard.css'

function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      if (user.role === 'HOST') {
        const [spaces, contracts] = await Promise.all([
          api.get('/users/my-spaces'),
          api.get('/users/my-contracts')
        ])
        setStats({
          spaces: spaces.data.length,
          contracts: contracts.data.length,
          published: spaces.data.filter(s => s.status === 'published').length
        })
      } else {
        const [reservations, contracts] = await Promise.all([
          api.get('/users/my-reservations'),
          api.get('/users/my-contracts')
        ])
        setStats({
          reservations: reservations.data.length,
          contracts: contracts.data.length,
          active: reservations.data.filter(r => !['cancelled', 'refunded', 'completed'].includes(r.status)).length
        })
      }
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <div className="container">
          <h1>Bienvenido, {user.first_name || user.email}</h1>
          <p>Panel de {user.role === 'HOST' ? 'Propietario' : 'Cliente'}</p>
        </div>
      </div>

      <div className="container">
        <div className="dashboard-grid">
          {user.role === 'HOST' ? (
            <>
              <div className="stat-card card">
                <h3>Mis Espacios</h3>
                <p className="stat-number">{stats?.spaces || 0}</p>
                <span className="stat-label">{stats?.published || 0} publicados</span>
              </div>
              <div className="stat-card card">
                <h3>Contratos</h3>
                <p className="stat-number">{stats?.contracts || 0}</p>
                <span className="stat-label">Total</span>
              </div>
            </>
          ) : (
            <>
              <div className="stat-card card">
                <h3>Reservaciones</h3>
                <p className="stat-number">{stats?.reservations || 0}</p>
                <span className="stat-label">{stats?.active || 0} activas</span>
              </div>
              <div className="stat-card card">
                <h3>Contratos</h3>
                <p className="stat-number">{stats?.contracts || 0}</p>
                <span className="stat-label">Total</span>
              </div>
            </>
          )}
        </div>

        <div className="quick-actions">
          <h2>Acciones Rapidas</h2>
          <div className="actions-grid">
            {user.role === 'HOST' ? (
              <>
                <Link to="/crear-espacio" className="action-card card">
                  <h3>Crear Espacio</h3>
                  <p>Publica un nuevo espacio para alquilar</p>
                </Link>
                <Link to="/mis-espacios" className="action-card card">
                  <h3>Mis Espacios</h3>
                  <p>Gestiona tus espacios publicados</p>
                </Link>
                <Link to="/citas" className="action-card card">
                  <h3>Citas</h3>
                  <p>Gestiona las visitas programadas</p>
                </Link>
              </>
            ) : (
              <>
                <Link to="/espacios" className="action-card card">
                  <h3>Buscar Espacios</h3>
                  <p>Encuentra el espacio ideal</p>
                </Link>
                <Link to="/mis-reservaciones" className="action-card card">
                  <h3>Mis Reservaciones</h3>
                  <p>Ve tus reservaciones activas</p>
                </Link>
                <Link to="/citas" className="action-card card">
                  <h3>Mis Citas</h3>
                  <p>Visitas programadas</p>
                </Link>
              </>
            )}
            <Link to="/mis-contratos" className="action-card card">
              <h3>Contratos</h3>
              <p>Revisa y firma contratos</p>
            </Link>
          </div>
        </div>

        {!user.anti_bypass_accepted && user.role === 'HOST' && (
          <div className="alert alert-warning">
            Debe aceptar la clausula anti-bypass antes de publicar espacios.{' '}
            <Link to="/legal/anti-bypass">Ver clausula</Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
