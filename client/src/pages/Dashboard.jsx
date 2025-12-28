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

function AdminDashboardPanel() {
  const { user } = useAuth()
  const [viewMode, setViewMode] = useState('client')
  const [loading, setLoading] = useState(true)
  const [clientStats, setClientStats] = useState(null)
  const [hostStats, setHostStats] = useState(null)
  const [clientData, setClientData] = useState({ reservations: [], contracts: [], payments: [], invoices: [] })
  const [hostData, setHostData] = useState({ spaces: [], reservations: [], contracts: [], payments: [], invoices: [] })

  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    setLoading(true)
    try {
      const [
        reservationsRes,
        contractsRes,
        paymentsRes,
        invoicesRes,
        spacesRes
      ] = await Promise.all([
        api.get('/admin/reservations').catch(() => ({ data: [] })),
        api.get('/admin/contracts').catch(() => ({ data: [] })),
        api.get('/admin/payments').catch(() => ({ data: [] })),
        api.get('/admin/invoices').catch(() => ({ data: [] })),
        api.get('/admin/spaces').catch(() => ({ data: [] }))
      ])

      const reservations = reservationsRes.data || []
      const contracts = contractsRes.data || []
      const payments = paymentsRes.data || []
      const invoices = invoicesRes.data || []
      const spaces = spacesRes.data || []

      setClientStats({
        totalReservations: reservations.length,
        activeReservations: reservations.filter(r => !['cancelled', 'refunded', 'completed'].includes(r.status)).length,
        totalContracts: contracts.length,
        activeContracts: contracts.filter(c => c.status === 'active').length,
        totalPayments: payments.length,
        pendingPayments: payments.filter(p => p.status === 'pending').length,
        totalInvoices: invoices.length
      })

      setHostStats({
        totalSpaces: spaces.length,
        publishedSpaces: spaces.filter(s => s.status === 'published').length,
        totalContracts: contracts.length,
        activeContracts: contracts.filter(c => c.status === 'active').length,
        totalReservations: reservations.length,
        pendingReservations: reservations.filter(r => r.status === 'pending').length
      })

      setClientData({
        reservations: reservations.slice(0, 10),
        contracts: contracts.slice(0, 10),
        payments: payments.slice(0, 10),
        invoices: invoices.slice(0, 10)
      })

      setHostData({
        spaces: spaces.slice(0, 10),
        reservations: reservations.slice(0, 10),
        contracts: contracts.slice(0, 10),
        payments: payments.slice(0, 10),
        invoices: invoices.slice(0, 10)
      })

    } catch (error) {
      console.error('Error loading admin data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString('es-BO')
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(amount || 0)
  }

  const getStatusBadge = (status) => {
    const statusColors = {
      active: '#27ae60',
      pending: '#f39c12',
      completed: '#3498db',
      cancelled: '#e74c3c',
      refunded: '#9b59b6',
      published: '#27ae60',
      draft: '#95a5a6',
      paid: '#27ae60',
      confirmed: '#27ae60'
    }
    return (
      <span style={{
        background: statusColors[status] || '#95a5a6',
        color: 'white',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        textTransform: 'uppercase'
      }}>
        {status}
      </span>
    )
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <div className="container">
          <h1>Panel de Administrador</h1>
          <p>Bienvenido, {user.first_name || user.email}</p>
        </div>
      </div>

      <div className="container">
        <div className="admin-view-toggle" style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '2rem',
          padding: '1rem',
          background: '#f8f9fa',
          borderRadius: '8px'
        }}>
          <button
            onClick={() => setViewMode('client')}
            className={`btn ${viewMode === 'client' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
          >
            Vista Cliente (GUEST)
          </button>
          <button
            onClick={() => setViewMode('host')}
            className={`btn ${viewMode === 'host' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
          >
            Vista Host (Propietario)
          </button>
        </div>

        {viewMode === 'client' ? (
          <>
            <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <Link to="/admin" className="stat-card card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>Reservaciones</h3>
                <p className="stat-number">{clientStats?.totalReservations || 0}</p>
                <span className="stat-label">{clientStats?.activeReservations || 0} activas</span>
              </Link>
              <Link to="/admin" className="stat-card card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>Contratos</h3>
                <p className="stat-number">{clientStats?.totalContracts || 0}</p>
                <span className="stat-label">{clientStats?.activeContracts || 0} activos</span>
              </Link>
              <Link to="/admin" className="stat-card card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>Pagos</h3>
                <p className="stat-number">{clientStats?.totalPayments || 0}</p>
                <span className="stat-label">{clientStats?.pendingPayments || 0} pendientes</span>
              </Link>
              <Link to="/admin" className="stat-card card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>Facturas</h3>
                <p className="stat-number">{clientStats?.totalInvoices || 0}</p>
                <span className="stat-label">Total emitidas</span>
              </Link>
            </div>

            <div className="admin-data-sections">
              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Reservaciones Recientes</h3>
                  <Link to="/admin" className="btn btn-sm btn-secondary">Ver todas</Link>
                </div>
                {clientData.reservations.length === 0 ? (
                  <p style={{ color: '#666' }}>No hay reservaciones</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Espacio</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Cliente</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fecha Inicio</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientData.reservations.map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to="/admin" style={{ color: '#3498db' }}>#{r.id}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>{r.space_title || r.space_id}</td>
                            <td style={{ padding: '0.5rem' }}>{r.guest_name || r.guest_email || r.guest_id}</td>
                            <td style={{ padding: '0.5rem' }}>{formatDate(r.start_date)}</td>
                            <td style={{ padding: '0.5rem' }}>{getStatusBadge(r.status)}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(r.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Contratos Recientes</h3>
                  <Link to="/admin" className="btn btn-sm btn-secondary">Ver todos</Link>
                </div>
                {clientData.contracts.length === 0 ? (
                  <p style={{ color: '#666' }}>No hay contratos</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Espacio</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Arrendatario</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Vigencia</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientData.contracts.map(c => (
                          <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to="/admin" style={{ color: '#3498db' }}>#{c.id}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>{c.space_title || c.space_id}</td>
                            <td style={{ padding: '0.5rem' }}>{c.guest_name || c.guest_email || c.guest_id}</td>
                            <td style={{ padding: '0.5rem' }}>{formatDate(c.start_date)} - {formatDate(c.end_date)}</td>
                            <td style={{ padding: '0.5rem' }}>{getStatusBadge(c.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Pagos Recientes</h3>
                  <Link to="/admin" className="btn btn-sm btn-secondary">Ver todos</Link>
                </div>
                {clientData.payments.length === 0 ? (
                  <p style={{ color: '#666' }}>No hay pagos</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Concepto</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fecha</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientData.payments.map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to="/admin" style={{ color: '#3498db' }}>#{p.id}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>{p.concept || p.type || 'Pago'}</td>
                            <td style={{ padding: '0.5rem' }}>{formatDate(p.created_at)}</td>
                            <td style={{ padding: '0.5rem' }}>{getStatusBadge(p.status)}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Facturas Recientes</h3>
                  <Link to="/admin" className="btn btn-sm btn-secondary">Ver todas</Link>
                </div>
                {clientData.invoices.length === 0 ? (
                  <p style={{ color: '#666' }}>No hay facturas</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Numero</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Cliente</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fecha</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientData.invoices.map(inv => (
                          <tr key={inv.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to="/admin" style={{ color: '#3498db' }}>{inv.invoice_number || `#${inv.id}`}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>{inv.client_name || inv.client_nit || '-'}</td>
                            <td style={{ padding: '0.5rem' }}>{formatDate(inv.created_at)}</td>
                            <td style={{ padding: '0.5rem' }}>{getStatusBadge(inv.status || 'emitida')}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(inv.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <Link to="/admin" className="stat-card card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>Espacios</h3>
                <p className="stat-number">{hostStats?.totalSpaces || 0}</p>
                <span className="stat-label">{hostStats?.publishedSpaces || 0} publicados</span>
              </Link>
              <Link to="/admin" className="stat-card card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>Reservaciones</h3>
                <p className="stat-number">{hostStats?.totalReservations || 0}</p>
                <span className="stat-label">{hostStats?.pendingReservations || 0} pendientes</span>
              </Link>
              <Link to="/admin" className="stat-card card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3>Contratos</h3>
                <p className="stat-number">{hostStats?.totalContracts || 0}</p>
                <span className="stat-label">{hostStats?.activeContracts || 0} activos</span>
              </Link>
            </div>

            <div className="admin-data-sections">
              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Espacios Registrados</h3>
                  <Link to="/admin" className="btn btn-sm btn-secondary">Ver todos</Link>
                </div>
                {hostData.spaces.length === 0 ? (
                  <p style={{ color: '#666' }}>No hay espacios registrados</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Titulo</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Propietario</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Ciudad</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Precio/Mes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostData.spaces.map(s => (
                          <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to={`/espacios/${s.id}`} style={{ color: '#3498db' }}>#{s.id}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to={`/espacios/${s.id}`} style={{ color: '#3498db' }}>{s.title}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>{s.owner_name || s.owner_email || s.owner_id}</td>
                            <td style={{ padding: '0.5rem' }}>{s.city || '-'}</td>
                            <td style={{ padding: '0.5rem' }}>{getStatusBadge(s.status)}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(s.price_per_month)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Reservaciones de Espacios</h3>
                  <Link to="/admin" className="btn btn-sm btn-secondary">Ver todas</Link>
                </div>
                {hostData.reservations.length === 0 ? (
                  <p style={{ color: '#666' }}>No hay reservaciones</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Espacio</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Solicitante</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Periodo</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostData.reservations.map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to="/admin" style={{ color: '#3498db' }}>#{r.id}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>{r.space_title || r.space_id}</td>
                            <td style={{ padding: '0.5rem' }}>{r.guest_name || r.guest_email || r.guest_id}</td>
                            <td style={{ padding: '0.5rem' }}>{formatDate(r.start_date)} - {formatDate(r.end_date)}</td>
                            <td style={{ padding: '0.5rem' }}>{getStatusBadge(r.status)}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(r.total_price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Contratos de Alquiler</h3>
                  <Link to="/admin" className="btn btn-sm btn-secondary">Ver todos</Link>
                </div>
                {hostData.contracts.length === 0 ? (
                  <p style={{ color: '#666' }}>No hay contratos</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Espacio</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Arrendatario</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Vigencia</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostData.contracts.map(c => (
                          <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to="/admin" style={{ color: '#3498db' }}>#{c.id}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>{c.space_title || c.space_id}</td>
                            <td style={{ padding: '0.5rem' }}>{c.guest_name || c.guest_email || c.guest_id}</td>
                            <td style={{ padding: '0.5rem' }}>{formatDate(c.start_date)} - {formatDate(c.end_date)}</td>
                            <td style={{ padding: '0.5rem' }}>{getStatusBadge(c.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3>Pagos Recibidos</h3>
                  <Link to="/admin" className="btn btn-sm btn-secondary">Ver todos</Link>
                </div>
                {hostData.payments.length === 0 ? (
                  <p style={{ color: '#666' }}>No hay pagos</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #eee' }}>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>ID</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Concepto</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Pagador</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fecha</th>
                          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Estado</th>
                          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostData.payments.map(p => (
                          <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '0.5rem' }}>
                              <Link to="/admin" style={{ color: '#3498db' }}>#{p.id}</Link>
                            </td>
                            <td style={{ padding: '0.5rem' }}>{p.concept || p.type || 'Pago'}</td>
                            <td style={{ padding: '0.5rem' }}>{p.payer_name || p.payer_email || '-'}</td>
                            <td style={{ padding: '0.5rem' }}>{formatDate(p.created_at)}</td>
                            <td style={{ padding: '0.5rem' }}>{getStatusBadge(p.status)}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="quick-actions" style={{ marginTop: '2rem' }}>
          <h2>Acceso Rapido</h2>
          <div className="actions-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <Link to="/admin" className="action-card card">
              <h3>Panel Admin</h3>
              <p>Acceso completo al panel de administracion</p>
            </Link>
            <Link to="/espacios" className="action-card card">
              <h3>Ver Espacios</h3>
              <p>Explorar espacios disponibles</p>
            </Link>
            <Link to="/mapa" className="action-card card">
              <h3>Mapa</h3>
              <p>Ver espacios en el mapa</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user.role !== 'ADMIN') {
      loadStats()
    } else {
      setLoading(false)
    }
  }, [user.role])

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

  if (user.role === 'ADMIN') {
    return <AdminDashboardPanel />
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
