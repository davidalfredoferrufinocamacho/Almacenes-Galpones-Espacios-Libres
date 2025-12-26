import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import api from '../services/api'
import './AdminDashboard.css'

function AdminDashboard() {
  const location = useLocation()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const response = await api.get('/admin/dashboard')
      setStats(response.data)
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
    <div className="admin-dashboard">
      <div className="admin-sidebar">
        <h2>Panel Admin</h2>
        <nav>
          <Link to="/admin" className={location.pathname === '/admin' ? 'active' : ''}>Dashboard</Link>
          <Link to="/admin/users" className={location.pathname === '/admin/users' ? 'active' : ''}>Usuarios</Link>
          <Link to="/admin/spaces" className={location.pathname === '/admin/spaces' ? 'active' : ''}>Espacios</Link>
          <Link to="/admin/reservations" className={location.pathname === '/admin/reservations' ? 'active' : ''}>Reservaciones</Link>
          <Link to="/admin/contracts" className={location.pathname === '/admin/contracts' ? 'active' : ''}>Contratos</Link>
          <Link to="/admin/payments" className={location.pathname === '/admin/payments' ? 'active' : ''}>Pagos</Link>
          <Link to="/admin/config" className={location.pathname === '/admin/config' ? 'active' : ''}>Configuracion</Link>
          <Link to="/admin/messages" className={location.pathname === '/admin/messages' ? 'active' : ''}>Mensajes</Link>
        </nav>
      </div>

      <div className="admin-content">
        <Routes>
          <Route path="/" element={<AdminOverview stats={stats} />} />
          <Route path="/users" element={<AdminUsers />} />
          <Route path="/spaces" element={<AdminSpaces />} />
          <Route path="/reservations" element={<AdminReservations />} />
          <Route path="/contracts" element={<AdminContracts />} />
          <Route path="/payments" element={<AdminPayments />} />
          <Route path="/config" element={<AdminConfig />} />
          <Route path="/messages" element={<AdminMessages />} />
        </Routes>
      </div>
    </div>
  )
}

function AdminOverview({ stats }) {
  return (
    <div className="admin-overview">
      <h1>Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card card">
          <h3>Usuarios</h3>
          <p className="stat-number">{stats?.users?.total || 0}</p>
          <span>GUEST: {stats?.users?.guests || 0} | HOST: {stats?.users?.hosts || 0}</span>
        </div>
        <div className="stat-card card">
          <h3>Espacios</h3>
          <p className="stat-number">{stats?.spaces?.total || 0}</p>
          <span>Publicados: {stats?.spaces?.published || 0}</span>
        </div>
        <div className="stat-card card">
          <h3>Reservaciones</h3>
          <p className="stat-number">{stats?.reservations?.total || 0}</p>
          <span>Activas: {stats?.reservations?.active || 0}</span>
        </div>
        <div className="stat-card card">
          <h3>Contratos</h3>
          <p className="stat-number">{stats?.contracts?.total || 0}</p>
          <span>Firmados: {stats?.contracts?.signed || 0}</span>
        </div>
        <div className="stat-card card">
          <h3>Escrow Retenido</h3>
          <p className="stat-number">Bs. {stats?.payments?.escrow_held?.toFixed(2) || '0.00'}</p>
          <span>En espera de liberacion</span>
        </div>
        <div className="stat-card card">
          <h3>Comisiones</h3>
          <p className="stat-number">Bs. {stats?.commissions?.total?.toFixed(2) || '0.00'}</p>
          <span>Total ganado</span>
        </div>
      </div>
    </div>
  )
}

function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/users').then(r => setUsers(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Usuarios</h1>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Rol</th>
            <th>Nombre</th>
            <th>Ciudad</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>{user.first_name} {user.last_name}</td>
              <td>{user.city}</td>
              <td>{user.is_active ? 'Activo' : 'Inactivo'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdminSpaces() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/spaces').then(r => setSpaces(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Espacios</h1>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Titulo</th>
            <th>Tipo</th>
            <th>Ciudad</th>
            <th>m²</th>
            <th>Estado</th>
            <th>Host</th>
          </tr>
        </thead>
        <tbody>
          {spaces.map(space => (
            <tr key={space.id}>
              <td>{space.title}</td>
              <td>{space.space_type}</td>
              <td>{space.city}</td>
              <td>{space.available_sqm}</td>
              <td>{space.status}</td>
              <td>{space.host_email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdminReservations() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/reservations').then(r => setReservations(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Reservaciones</h1>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Espacio</th>
            <th>Guest</th>
            <th>m²</th>
            <th>Total</th>
            <th>Anticipo</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {reservations.map(r => (
            <tr key={r.id}>
              <td>{r.space_title}</td>
              <td>{r.guest_email}</td>
              <td>{r.sqm_requested}</td>
              <td>Bs. {r.total_amount.toFixed(2)}</td>
              <td>Bs. {r.deposit_amount.toFixed(2)}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdminContracts() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/contracts').then(r => setContracts(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Contratos</h1>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Numero</th>
            <th>Espacio</th>
            <th>Guest</th>
            <th>Host</th>
            <th>Total</th>
            <th>Comision</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map(c => (
            <tr key={c.id}>
              <td>{c.contract_number}</td>
              <td>{c.space_title}</td>
              <td>{c.guest_email}</td>
              <td>{c.host_email}</td>
              <td>Bs. {c.total_amount.toFixed(2)}</td>
              <td>Bs. {c.commission_amount.toFixed(2)}</td>
              <td>{c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdminPayments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/payments').then(r => setPayments(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Pagos</h1>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Tipo</th>
            <th>Monto</th>
            <th>Metodo</th>
            <th>Estado</th>
            <th>Escrow</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(p => (
            <tr key={p.id}>
              <td>{p.user_email}</td>
              <td>{p.payment_type}</td>
              <td>Bs. {p.amount.toFixed(2)}</td>
              <td>{p.payment_method}</td>
              <td>{p.status}</td>
              <td>{p.escrow_status || '-'}</td>
              <td>{new Date(p.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AdminConfig() {
  const [config, setConfig] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/config').then(r => setConfig(r.data)).finally(() => setLoading(false))
  }, [])

  const handleUpdate = async (key, value) => {
    try {
      await api.put(`/admin/config/${key}`, { value })
      alert('Configuracion actualizada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Configuracion del Sistema</h1>
      <div className="config-list card">
        {config.map(c => (
          <div key={c.id} className="config-item">
            <div>
              <strong>{c.key}</strong>
              <p>{c.description}</p>
            </div>
            <div className="config-value">
              <input 
                type="text" 
                defaultValue={c.value} 
                onBlur={(e) => e.target.value !== c.value && handleUpdate(c.key, e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdminMessages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/contact-messages').then(r => setMessages(r.data)).finally(() => setLoading(false))
  }, [])

  const handleRespond = async (id) => {
    const response = prompt('Escriba su respuesta:')
    if (!response) return

    try {
      await api.put(`/admin/contact-messages/${id}/respond`, { response })
      api.get('/admin/contact-messages').then(r => setMessages(r.data))
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mensajes de Contacto</h1>
      <div className="messages-list">
        {messages.map(m => (
          <div key={m.id} className="message-item card">
            <div className="message-header">
              <strong>{m.name}</strong> - {m.email}
              <span className={`status-badge status-${m.status}`}>{m.status}</span>
            </div>
            <p className="subject">{m.subject}</p>
            <p>{m.message}</p>
            {m.status === 'pending' && (
              <button onClick={() => handleRespond(m.id)} className="btn btn-secondary">
                Responder
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default AdminDashboard
