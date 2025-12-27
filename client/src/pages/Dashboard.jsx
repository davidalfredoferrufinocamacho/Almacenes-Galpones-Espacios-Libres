import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import './Dashboard.css'

function AntiBypassAcceptance({ onAccepted }) {
  const [legalText, setLegalText] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    api.get('/legal/anti-bypass').then(r => {
      setLegalText(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleAccept = async () => {
    if (!accepted) {
      alert('Debe marcar la casilla de aceptacion')
      return
    }
    setAccepting(true)
    try {
      await api.put('/users/me/accept-anti-bypass')
      alert('Clausula aceptada exitosamente')
      onAccepted()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al aceptar')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) return <div className="card" style={{padding:'1rem'}}>Cargando clausula...</div>

  return (
    <div className="card anti-bypass-acceptance" style={{marginTop:'2rem', padding:'1.5rem', border:'2px solid #e74c3c'}}>
      <h3 style={{color:'#e74c3c', marginBottom:'1rem'}}>Clausula Anti-Bypass Obligatoria</h3>
      <p style={{marginBottom:'1rem'}}>Antes de publicar espacios, debe leer y aceptar la siguiente clausula:</p>
      <div style={{background:'#f8f9fa', padding:'1rem', borderRadius:'8px', maxHeight:'200px', overflow:'auto', marginBottom:'1rem', fontSize:'0.9rem'}}>
        {legalText?.content || 'Error al cargar el texto legal'}
      </div>
      <div style={{marginBottom:'1rem'}}>
        <label style={{display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer'}}>
          <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
          <span>He leido, entiendo y acepto la Clausula Anti-Bypass (Version {legalText?.version})</span>
        </label>
      </div>
      <button onClick={handleAccept} disabled={accepting || !accepted} className="btn btn-primary" style={{width:'100%'}}>
        {accepting ? 'Procesando...' : 'Aceptar Clausula Anti-Bypass'}
      </button>
    </div>
  )
}

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
          <AntiBypassAcceptance onAccepted={() => window.location.reload()} />
        )}
      </div>
    </div>
  )
}

export default Dashboard
