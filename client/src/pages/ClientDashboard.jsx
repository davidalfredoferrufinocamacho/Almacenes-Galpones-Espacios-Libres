import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import './ClientDashboard.css'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function ClientDashboard() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [showAntiBypass, setShowAntiBypass] = useState(false)
  const [antiBypassData, setAntiBypassData] = useState(null)
  const [antiBypassAccepting, setAntiBypassAccepting] = useState(false)
  const [clientName, setClientName] = useState('')

  useEffect(() => {
    checkAntiBypass()
    loadClientName()
  }, [])

  const loadClientName = async () => {
    try {
      const res = await api.get('/client/profile')
      const fullName = [res.data.first_name, res.data.last_name].filter(Boolean).join(' ')
      setClientName(fullName || '')
    } catch (error) {
      console.error('Error loading client name:', error)
    }
  }

  const checkAntiBypass = async () => {
    try {
      const res = await api.get('/client/profile')
      if (!res.data.anti_bypass_accepted) {
        const legalRes = await api.get('/legal/texts?category=anti_bypass')
        const antiBypassText = legalRes.data.find(t => t.type === 'anti_bypass' && t.is_active)
        if (antiBypassText) {
          setAntiBypassData(antiBypassText)
          setShowAntiBypass(true)
        }
      }
    } catch (error) {
      console.error('Error checking anti-bypass:', error)
    }
  }

  const handleAcceptAntiBypass = async () => {
    setAntiBypassAccepting(true)
    try {
      await api.put('/users/me/accept-anti-bypass')
      setShowAntiBypass(false)
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setAntiBypassAccepting(false)
  }

  const menuItems = [
    { id: 'dashboard', label: 'Mi Dashboard', icon: '📊' },
    { id: 'appointments', label: 'Mis Citas', icon: '📅' },
    { id: 'contracts', label: 'Mis Contratos', icon: '📝' },
    { id: 'spaces', label: 'Mis Espacios', icon: '🏢' },
    { id: 'invoices', label: 'Mis Facturas', icon: '🧾' },
    { id: 'payments', label: 'Mis Pagos', icon: '💳' },
    { id: 'reservations', label: 'Mis Reservaciones', icon: '📋' }
  ]

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard': return <ClientHome />
      case 'appointments': return <ClientAppointments />
      case 'contracts': return <ClientContracts />
      case 'spaces': return <ClientSpaces />
      case 'invoices': return <ClientInvoices />
      case 'payments': return <ClientPayments />
      case 'reservations': return <ClientReservations />
      case 'profile': return <ClientProfile />
      default: return <ClientHome />
    }
  }

  return (
    <div className="client-dashboard">
      {showAntiBypass && (
        <div className="modal-overlay">
          <div className="modal anti-bypass-modal">
            <div className="modal-header">
              <h2>Clausula Anti-Bypass</h2>
            </div>
            <div className="modal-body">
              <p className="anti-bypass-intro">
                Para continuar utilizando la plataforma, debe aceptar los terminos de nuestra clausula anti-bypass que protege las transacciones realizadas a traves de nuestra plataforma.
              </p>
              <div className="legal-text-container">
                <h3>{antiBypassData?.title}</h3>
                <div className="legal-content" dangerouslySetInnerHTML={{ __html: antiBypassData?.content?.replace(/\n/g, '<br>') || '' }} />
                <p className="version-info">Version {antiBypassData?.version} - Vigente desde: {antiBypassData?.effective_date}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={handleAcceptAntiBypass} className="btn btn-primary" disabled={antiBypassAccepting}>
                {antiBypassAccepting ? 'Procesando...' : 'Acepto los Terminos'}
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="client-sidebar">
        <div className="client-sidebar-header">
          <h2>Portal del Cliente</h2>
          {clientName && <p className="client-name">{clientName}</p>}
          <button 
            className={`profile-btn ${activeSection === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveSection('profile')}
          >
            <span>👤</span> Mi Perfil
          </button>
        </div>
        <nav className="client-nav">
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`client-nav-item ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="client-main">
        {renderContent()}
      </main>
    </div>
  )
}

function ClientHome() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/client/dashboard').then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>
  if (!data) return <div>Error al cargar datos</div>

  return (
    <div>
      <h1>Bienvenido a tu Portal</h1>
      <div className="client-stats-grid">
        <div className="stat-card">
          <h3>Reservaciones Totales</h3>
          <div className="stat-value">{data.stats?.reservationsTotal || 0}</div>
        </div>
        <div className="stat-card stat-active">
          <h3>Reservaciones Activas</h3>
          <div className="stat-value">{data.stats?.reservationsActive || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Contratos Firmados</h3>
          <div className="stat-value">{data.stats?.contractsSigned || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Total Pagado</h3>
          <div className="stat-value">Bs. {(data.stats?.totalPaid || 0).toLocaleString()}</div>
        </div>
      </div>

      {data.nextReservation && (
        <div className="client-section highlight-section">
          <h2>Proxima Reservacion</h2>
          <div className="next-reservation-card">
            <div className="nrc-info">
              <h3>{data.nextReservation.space_title}</h3>
              <p>{data.nextReservation.city}</p>
              <p className="dates">{data.nextReservation.start_date} - {data.nextReservation.end_date}</p>
            </div>
            <span className={`status-badge status-${data.nextReservation.status}`}>{data.nextReservation.status}</span>
          </div>
        </div>
      )}

      {data.contractsToSign?.length > 0 && (
        <div className="client-section alert-section">
          <h2>Contratos Pendientes de Firma</h2>
          <ul className="pending-list">
            {data.contractsToSign.map(c => (
              <li key={c.id}>
                <span>{c.contract_number} - {c.space_title}</span>
                <button className="btn btn-sm btn-primary">Firmar</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.pendingPayments?.length > 0 && (
        <div className="client-section warning-section">
          <h2>Pagos Pendientes</h2>
          <ul className="pending-list">
            {data.pendingPayments.map(p => (
              <li key={p.id}>
                <span>{p.space_title}</span>
                <strong>Bs. {p.remaining_amount?.toLocaleString()}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="client-section">
        <h2>Actividad Reciente</h2>
        {data.recentActivity?.length > 0 ? (
          <table className="client-table">
            <thead>
              <tr><th>Tipo</th><th>Descripcion</th><th>Monto</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {data.recentActivity.map((a, i) => (
                <tr key={i}>
                  <td><span className={`activity-icon activity-${a.type}`}>{a.type === 'payment' ? '💳' : a.type === 'contract' ? '📝' : '📅'}</span></td>
                  <td>{a.description}</td>
                  <td>Bs. {a.amount?.toLocaleString()}</td>
                  <td>{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="no-data">No hay actividad reciente</p>
        )}
      </div>
    </div>
  )
}

function ClientReservations() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', period: '' })
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const statusLabels = {
    pending: 'Pendiente',
    PAID_DEPOSIT_ESCROW: 'Reservado',
    appointment_scheduled: 'Cita Agendada',
    appointment_confirmed: 'Cita Confirmada',
    visit_completed: 'Visita Realizada',
    dates_proposed: 'Fechas Propuestas',
    dates_confirmed: 'Fechas Confirmadas',
    awaiting_full_payment: 'Esperando Pago',
    full_paid: 'Pago Completo',
    fully_paid: 'Pago Completo',
    contract_pending: 'Contrato Pendiente',
    confirmed: 'Confirmado',
    contract_signed: 'Contrato Firmado',
    completed: 'Completado',
    cancelled: 'Cancelado',
    refunded: 'Cancelado'
  }

  const [showDatesModal, setShowDatesModal] = useState(false)
  const [datesForm, setDatesForm] = useState({ rental_start_date: '', rental_end_date: '', rental_start_time: '08:00' })

  useEffect(() => { loadReservations() }, [filter])

  const loadReservations = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter.status) params.append('status', filter.status)
    if (filter.period) params.append('period', filter.period)
    api.get(`/client/reservations?${params}`).then(res => {
      setReservations(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const viewDetail = async (id) => {
    setDetailLoading(true)
    try {
      const res = await api.get(`/client/reservations/${id}`)
      setSelected(res.data)
    } catch (error) {
      alert('Error al cargar detalle')
    }
    setDetailLoading(false)
  }

  const handleCancel = async (id) => {
    if (!confirm('Esta seguro de cancelar esta reservacion?')) return
    try {
      await api.post(`/client/reservations/${id}/cancel`)
      setSelected(null)
      loadReservations()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handlePayRemaining = async (id) => {
    if (!confirm('Confirma el pago del saldo restante? Se generara automaticamente el contrato.')) return
    try {
      const res = await api.post(`/payments/remaining/${id}`, { payment_method: 'card' })
      alert(`Pago completado. Contrato #${res.data.contract_number} generado. Por favor proceda a firmarlo en la seccion de Contratos.`)
      setSelected(null)
      loadReservations()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al procesar pago')
    }
  }

  const handleNotInterested = async (id) => {
    if (!confirm('Esta seguro de cancelar? Esta accion no se puede deshacer.')) return
    try {
      await api.post(`/client/reservations/${id}/cancel`)
      loadReservations()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al cancelar')
    }
  }

  const handleRejectAfterVisit = async (id) => {
    if (!confirm('Rechazar el espacio despues de la visita?')) return
    try {
      await api.post(`/client/reservations/${id}/reject-after-visit`)
      alert('Espacio rechazado.')
      setSelected(null)
      loadReservations()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleProposeDates = async () => {
    if (!datesForm.rental_start_date || !datesForm.rental_end_date || !datesForm.rental_start_time) {
      return alert('Complete todas las fechas y hora')
    }
    try {
      await api.post(`/client/reservations/${selected.id}/propose-dates`, datesForm)
      alert('Fechas propuestas exitosamente. Esperando confirmacion del propietario.')
      setShowDatesModal(false)
      setDatesForm({ rental_start_date: '', rental_end_date: '', rental_start_time: '08:00' })
      const res = await api.get(`/client/reservations/${selected.id}`)
      setSelected(res.data)
      loadReservations()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handlePayRemainingNew = async (id) => {
    if (!confirm('Confirma el pago del saldo restante?')) return
    try {
      await api.post(`/client/reservations/${id}/pay-remaining`, { payment_method: 'transfer' })
      alert('Pago iniciado. El administrador verificara su pago y se generara el contrato.')
      setSelected(null)
      loadReservations()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleAcceptDatesFromHost = async (id) => {
    if (!confirm('Acepta las fechas propuestas por el propietario?')) return
    try {
      await api.post(`/client/reservations/${id}/accept-proposed-dates`)
      alert('Fechas aceptadas. Puede proceder con el pago.')
      const res = await api.get(`/client/reservations/${id}`)
      setSelected(res.data)
      loadReservations()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mis Reservaciones</h1>
      <div className="filters-bar">
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="appointment_scheduled">Cita Agendada</option>
          <option value="appointment_confirmed">Cita Confirmada</option>
          <option value="visit_completed">Visita Realizada</option>
          <option value="full_paid">Pago Completo</option>
          <option value="contract_pending">Contrato Pendiente</option>
          <option value="contract_signed">Contrato Firmado</option>
          <option value="completed">Completada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select value={filter.period} onChange={e => setFilter({ ...filter, period: e.target.value })}>
          <option value="">Todo el tiempo</option>
          <option value="month">Ultimo mes</option>
          <option value="3months">Ultimos 3 meses</option>
          <option value="year">Ultimo anio</option>
        </select>
      </div>

      {reservations.length > 0 ? (
        <div className="reservations-list">
          {reservations.map(r => (
            <div key={r.id} className="reservation-item card">
              <div className="reservation-header">
                <h3>{r.space_title}</h3>
                <span className={`status-badge status-${r.status?.toLowerCase().replace('_', '-')}`}>
                  {statusLabels[r.status] || r.status}
                </span>
              </div>
              <div className="reservation-details">
                <div className="detail">
                  <span className="label">Ubicacion:</span>
                  <span>{r.city}, {r.department}</span>
                </div>
                <div className="detail">
                  <span className="label">m² solicitados:</span>
                  <span>{r.sqm_requested} m²</span>
                </div>
                <div className="detail">
                  <span className="label">Periodo:</span>
                  <span>{r.period_quantity} {r.period_type}</span>
                </div>
                <div className="detail">
                  <span className="label">Total:</span>
                  <span className="amount">Bs. {r.total_amount?.toFixed(2)}</span>
                </div>
              </div>
              <div className="reservation-actions">
                {r.status === 'appointment_scheduled' && (
                  <button onClick={() => viewDetail(r.id)} className="btn btn-secondary">
                    Ver Estado de Cita
                  </button>
                )}
                {r.status === 'visit_completed' && (
                  <>
                    <button onClick={() => viewDetail(r.id)} className="btn btn-primary">
                      Pagar 100%
                    </button>
                    <button onClick={() => handleNotInterested(r.id)} className="btn btn-outline">
                      No me interesa
                    </button>
                  </>
                )}
                {r.status === 'full_paid' && (
                  <button onClick={() => viewDetail(r.id)} className="btn btn-primary">
                    Generar Contrato
                  </button>
                )}
                {['pending', 'confirmed'].includes(r.status) && (
                  <button onClick={() => handleCancel(r.id)} className="btn btn-danger">Cancelar</button>
                )}
                <button onClick={() => viewDetail(r.id)} className="btn btn-outline">Ver Detalle</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="no-data">No tienes reservaciones</p>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal reservation-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detalle de Reservacion</h2>
              <button className="close-btn" onClick={() => setSelected(null)}>×</button>
            </div>
            {detailLoading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : (
              <div className="modal-body">
                <div className="detail-section">
                  <h3>Espacio</h3>
                  <p><strong>{selected.space_title}</strong></p>
                  <p>{selected.address}, {selected.city}</p>
                  <p>{selected.space_description}</p>
                </div>
                <div className="detail-grid">
                  <div>
                    <h4>Fechas</h4>
                    <p>{selected.start_date} - {selected.end_date}</p>
                  </div>
                  <div>
                    <h4>Propietario</h4>
                    <p>{selected.host_name}</p>
                  </div>
                  <div>
                    <h4>Monto Total</h4>
                    <p>Bs. {selected.total_amount?.toLocaleString()}</p>
                  </div>
                  <div>
                    <h4>Estado Pago</h4>
                    <p>{selected.status === 'full_paid' ? 'Pagado 100%' : 'Pendiente'}</p>
                  </div>
                </div>
                <div className="detail-section">
                  <h3>Estado</h3>
                  <span className={`status-badge status-${selected.status}`}>{selected.status}</span>
                </div>

                {selected.payments?.length > 0 && (
                  <div className="detail-section">
                    <h3>Historial de Pagos</h3>
                    <table className="client-table sm">
                      <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead>
                      <tbody>
                        {selected.payments.map(p => (
                          <tr key={p.id}>
                            <td>{new Date(p.created_at).toLocaleDateString()}</td>
                            <td>{p.payment_type}</td>
                            <td>Bs. {p.amount?.toLocaleString()}</td>
                            <td><span className={`status-badge status-${p.status}`}>{p.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selected.contract && (
                  <div className="detail-section">
                    <h3>Contrato</h3>
                    <p>Numero: {selected.contract.contract_number}</p>
                    <p>Estado: <span className={`status-badge status-${selected.contract.status}`}>{selected.contract.status}</span></p>
                  </div>
                )}
              </div>
            )}
            <div className="modal-footer">
              {selected.status === 'visit_completed' && (
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', width: '100%', marginBottom: '1rem' }}>
                  <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', textAlign: 'center', flex: 1, minWidth: '200px' }}>
                    <h4 style={{ marginBottom: '0.5rem', color: '#92400e' }}>Visita Completada</h4>
                    <p style={{ fontSize: '0.9rem', color: '#78350f', marginBottom: '1rem' }}>Pague el 100% para cerrar el contrato o rechace el espacio:</p>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => handleRejectAfterVisit(selected.id)} 
                        className="btn btn-outline"
                        style={{ borderColor: '#dc2626', color: '#dc2626' }}
                      >
                        No me interesa
                      </button>
                      <button 
                        onClick={() => handlePayRemaining(selected.id)} 
                        className="btn btn-primary"
                      >
                        Pagar 100% - Bs. {selected.total_amount?.toLocaleString()}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {selected.status === 'dates_proposed' && selected.dates_proposed_by === 'GUEST' && (
                <div style={{ background: '#dbeafe', padding: '1rem', borderRadius: '8px', textAlign: 'center', width: '100%', marginBottom: '1rem' }}>
                  <h4 style={{ color: '#1e40af' }}>Esperando Confirmacion</h4>
                  <p>Sus fechas propuestas estan siendo revisadas por el propietario.</p>
                  <p><strong>Inicio:</strong> {selected.rental_start_date} a las {selected.rental_start_time}</p>
                  <p><strong>Fin:</strong> {selected.rental_end_date}</p>
                </div>
              )}
              {selected.status === 'dates_proposed' && selected.dates_proposed_by === 'HOST' && (
                <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', textAlign: 'center', width: '100%', marginBottom: '1rem' }}>
                  <h4 style={{ color: '#92400e' }}>Propuesta del Propietario</h4>
                  <p>El propietario ha propuesto las siguientes fechas:</p>
                  <p><strong>Inicio:</strong> {selected.rental_start_date} a las {selected.rental_start_time}</p>
                  <p><strong>Fin:</strong> {selected.rental_end_date}</p>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
                    <button onClick={() => handleAcceptDatesFromHost(selected.id)} className="btn btn-success">Aceptar Fechas</button>
                    <button onClick={() => setShowDatesModal(true)} className="btn btn-outline">Contraproponer</button>
                  </div>
                </div>
              )}
              {selected.status === 'dates_confirmed' && (
                <div style={{ background: '#dcfce7', padding: '1rem', borderRadius: '8px', textAlign: 'center', width: '100%', marginBottom: '1rem' }}>
                  <h4 style={{ color: '#166534' }}>Fechas Confirmadas</h4>
                  <p><strong>Inicio:</strong> {selected.rental_start_date} a las {selected.rental_start_time}</p>
                  <p><strong>Fin:</strong> {selected.rental_end_date}</p>
                  <p style={{ marginTop: '1rem' }}>Proceda con el pago del 100% para generar el contrato:</p>
                  <button 
                    onClick={() => handlePayRemaining(selected.id)} 
                    className="btn btn-primary"
                    style={{ marginTop: '0.5rem' }}
                  >
                    Pagar 100% - Bs. {selected.total_amount?.toLocaleString()}
                  </button>
                </div>
              )}
              {selected.status === 'full_paid' && (
                <div style={{ background: '#dcfce7', padding: '1rem', borderRadius: '8px', textAlign: 'center', width: '100%', marginBottom: '1rem' }}>
                  <h4 style={{ color: '#166534' }}>Pago Completo Realizado</h4>
                  <p style={{ marginTop: '0.5rem' }}>Su pago ha sido procesado exitosamente.</p>
                  <button 
                    onClick={() => window.location.href = `/mis-contratos?generate=${selected.id}`}
                    className="btn btn-primary"
                    style={{ marginTop: '0.5rem' }}
                  >
                    Generar Contrato
                  </button>
                </div>
              )}
              {selected.status === 'awaiting_full_payment' && (
                <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', textAlign: 'center', width: '100%', marginBottom: '1rem' }}>
                  <h4 style={{ color: '#92400e' }}>Pago en Proceso</h4>
                  <p>Su pago esta siendo verificado. El contrato se generara automaticamente cuando se confirme.</p>
                </div>
              )}
              {['pending', 'confirmed'].includes(selected.status) && (
                <button onClick={() => handleCancel(selected.id)} className="btn btn-danger">Cancelar Reservacion</button>
              )}
              <button onClick={() => setSelected(null)} className="btn btn-secondary">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showDatesModal && selected && (
        <div className="modal-overlay" onClick={() => setShowDatesModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Proponer Fechas de Alquiler</h2>
              <button className="close-btn" onClick={() => setShowDatesModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>Espacio: <strong>{selected.space_title}</strong></p>
              <div className="form-group">
                <label>Fecha de Inicio del Alquiler</label>
                <input 
                  type="date" 
                  value={datesForm.rental_start_date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setDatesForm({ ...datesForm, rental_start_date: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>Hora de Inicio</label>
                <input 
                  type="time" 
                  value={datesForm.rental_start_time}
                  onChange={e => setDatesForm({ ...datesForm, rental_start_time: e.target.value })}
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label>Fecha de Fin del Alquiler</label>
                <input 
                  type="date" 
                  value={datesForm.rental_end_date}
                  min={datesForm.rental_start_date || new Date().toISOString().split('T')[0]}
                  onChange={e => setDatesForm({ ...datesForm, rental_end_date: e.target.value })}
                  className="form-control"
                />
              </div>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
                  El propietario revisara su propuesta. Una vez que ambos acuerden las fechas, 
                  podra proceder con el pago del saldo restante de <strong>Bs. {selected.remaining_amount?.toLocaleString()}</strong>.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowDatesModal(false)} className="btn btn-outline">Cancelar</button>
              <button onClick={handleProposeDates} className="btn btn-primary">Enviar Propuesta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientContracts() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [signing, setSigning] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState([])
  const [showPayModal, setShowPayModal] = useState(false)
  const [payingContract, setPayingContract] = useState(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')
  const [paying, setPaying] = useState(false)

  useEffect(() => { 
    loadContracts()
    loadPaymentMethods()
  }, [filter])

  const loadContracts = () => {
    setLoading(true)
    api.get('/contracts/my-contracts').then(res => {
      setContracts(res.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const loadPaymentMethods = () => {
    api.get('/spaces/payment-methods').then(res => {
      setPaymentMethods(res.data || [])
    }).catch(() => {})
  }

  const viewContract = async (id) => {
    try {
      const res = await api.get(`/client/contracts/${id}`)
      setSelected(res.data)
    } catch (error) {
      alert('Error al cargar contrato')
    }
  }

  const handleSign = async () => {
    if (!confirm('Confirma que desea firmar este contrato? Esta accion es irrevocable.')) return
    setSigning(true)
    try {
      await api.post(`/client/contracts/${selected.id}/sign`)
      const res = await api.get(`/client/contracts/${selected.id}`)
      setSelected(res.data)
      loadContracts()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setSigning(false)
  }

  const openPayModal = (contract) => {
    setPayingContract(contract)
    setSelectedPaymentMethod('')
    setShowPayModal(true)
  }

  const handlePayContract = async () => {
    if (!payingContract || !selectedPaymentMethod) return
    setPaying(true)
    try {
      const res = await api.post(`/payments/contract/${payingContract.id}`, {
        payment_method: selectedPaymentMethod
      })
      alert('Pago completado exitosamente.\n\n' + res.data.message)
      setShowPayModal(false)
      setPayingContract(null)
      loadContracts()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setPaying(false)
  }

  const downloadPDF = (id) => {
    window.open(`/api/contracts/${id}/pdf`, '_blank')
  }

  const statusLabels = {
    guest_proposed: 'Propuesta Enviada',
    host_approved: 'Aprobado - Pendiente Pago',
    host_rejected: 'Rechazado',
    pending: 'Pendiente Firma',
    signed: 'Firmado',
    active: 'Activo',
    completed: 'Completado',
    cancelled: 'Cancelado'
  }

  const periodLabels = {
    dia: 'dia(s)', semana: 'semana(s)', mes: 'mes(es)',
    trimestre: 'trimestre(s)', semestre: 'semestre(s)', ano: 'ano(s)'
  }

  // Separar contratos por categoria
  const proposedContracts = contracts.filter(c => c.status === 'guest_proposed')
  const approvedContracts = contracts.filter(c => c.status === 'host_approved')
  const rejectedContracts = contracts.filter(c => c.status === 'host_rejected')
  const activeContracts = contracts.filter(c => ['pending', 'signed', 'active', 'completed'].includes(c.status))

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mis Contratos</h1>

      {/* Contratos Aprobados - Listos para Pagar */}
      {approvedContracts.length > 0 && (
        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#d1fae5', border: '2px solid #10b981', borderRadius: '12px' }}>
          <h2 style={{ color: '#065f46', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>💰</span> Contratos Aprobados - Listos para Pagar ({approvedContracts.length})
          </h2>
          <p style={{ marginBottom: '1rem', color: '#047857', fontSize: '0.9rem' }}>
            El propietario ha aprobado las siguientes propuestas. Complete el pago para activar el contrato.
          </p>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {approvedContracts.map(c => (
              <div key={c.id} style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>{c.space_title}</h4>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      <strong>Superficie:</strong> {c.sqm} m² | <strong>Periodo:</strong> {c.period_quantity} {periodLabels[c.period_type] || c.period_type}
                    </p>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                      <strong>Fechas:</strong> {new Date(c.start_date).toLocaleDateString()} - {new Date(c.end_date).toLocaleDateString()}
                    </p>
                    <p style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0369a1' }}>
                      Total a Pagar: Bs. {(c.total_amount || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <button 
                      onClick={() => openPayModal(c)} 
                      className="btn btn-primary"
                      style={{ padding: '0.75rem 2rem', fontSize: '1rem' }}
                    >
                      💳 Pagar Ahora
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Propuestas Pendientes de Aprobacion */}
      {proposedContracts.length > 0 && (
        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px' }}>
          <h2 style={{ color: '#92400e', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⏳</span> Propuestas Pendientes de Aprobacion ({proposedContracts.length})
          </h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {proposedContracts.map(c => (
              <div key={c.id} style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <h4>{c.space_title}</h4>
                <p style={{ fontSize: '0.9rem' }}>
                  {c.sqm} m² - {c.period_quantity} {periodLabels[c.period_type] || c.period_type} - Bs. {(c.total_amount || 0).toLocaleString()}
                </p>
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Esperando que el propietario apruebe su propuesta...
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Propuestas Rechazadas */}
      {rejectedContracts.length > 0 && (
        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '12px' }}>
          <h2 style={{ color: '#b91c1c', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>❌</span> Propuestas Rechazadas ({rejectedContracts.length})
          </h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {rejectedContracts.map(c => (
              <div key={c.id} style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <h4>{c.space_title}</h4>
                <p style={{ fontSize: '0.9rem' }}>Monto: Bs. {(c.total_amount || 0).toLocaleString()}</p>
                {c.host_rejection_reason && (
                  <p style={{ fontSize: '0.85rem', color: '#b91c1c', marginTop: '0.5rem' }}>
                    <strong>Motivo:</strong> {c.host_rejection_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Pago */}
      {showPayModal && payingContract && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Completar Pago</h2>
              <button className="close-btn" onClick={() => setShowPayModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                <h4>{payingContract.space_title}</h4>
                <p style={{ fontSize: '0.9rem' }}>
                  {payingContract.sqm} m² - {payingContract.period_quantity} {periodLabels[payingContract.period_type] || payingContract.period_type}
                </p>
                <p style={{ fontSize: '0.9rem' }}>
                  {new Date(payingContract.start_date).toLocaleDateString()} - {new Date(payingContract.end_date).toLocaleDateString()}
                </p>
              </div>

              <div style={{ padding: '1rem', background: '#e0f2fe', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0369a1' }}>
                  Bs. {(payingContract.total_amount || 0).toLocaleString()}
                </p>
              </div>

              <div className="form-group">
                <label>Metodo de Pago</label>
                <select 
                  value={selectedPaymentMethod} 
                  onChange={e => setSelectedPaymentMethod(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                >
                  <option value="">Seleccione metodo de pago...</option>
                  {paymentMethods.map(pm => (
                    <option key={pm.code} value={pm.code}>{pm.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowPayModal(false)} className="btn btn-outline">Cancelar</button>
              <button 
                onClick={handlePayContract} 
                className="btn btn-primary" 
                disabled={!selectedPaymentMethod || paying}
              >
                {paying ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtro para contratos activos */}
      <div className="filters-bar">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Todos los Contratos Activos</option>
          <option value="pending">Pendientes de Firma</option>
          <option value="signed">Firmados</option>
        </select>
      </div>

      {contracts.length > 0 ? (
        <table className="client-table">
          <thead>
            <tr><th>Numero</th><th>Espacio</th><th>Propietario</th><th>Monto</th><th>Fechas</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {contracts.map(c => (
              <tr key={c.id}>
                <td>{c.contract_number}</td>
                <td>{c.space_title}</td>
                <td>{c.host_name}</td>
                <td>Bs. {c.total_amount?.toLocaleString()}</td>
                <td>{c.start_date} - {c.end_date}</td>
                <td>
                  <span className={`status-badge ${c.guest_signed && c.host_signed ? 'status-signed' : 'status-pending'}`}>
                    {c.guest_signed && c.host_signed ? 'Firmado' : c.guest_signed ? 'Esperando Host' : 'Pendiente'}
                  </span>
                </td>
                <td>
                  <button onClick={() => viewContract(c.id)} className="btn btn-sm">Ver</button>
                  {c.guest_signed && c.host_signed && (
                    <button onClick={() => downloadPDF(c.id)} className="btn btn-sm btn-secondary">PDF</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="no-data">No tienes contratos</p>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal contract-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Contrato {selected.contract_number}</h2>
              <button className="close-btn" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div>
                  <h4>Espacio</h4>
                  <p>{selected.space_title}</p>
                  <p className="small">{selected.address}, {selected.city}</p>
                </div>
                <div>
                  <h4>Propietario</h4>
                  <p>{selected.host_name}</p>
                  <p className="small">{selected.host_email}</p>
                </div>
                <div>
                  <h4>Periodo</h4>
                  <p>{selected.start_date} - {selected.end_date}</p>
                </div>
                <div>
                  <h4>Monto Total</h4>
                  <p>Bs. {selected.total_amount?.toLocaleString()}</p>
                </div>
              </div>

              <div className="signature-status">
                <div className={`sig-box ${selected.guest_signed ? 'signed' : ''}`}>
                  <h4>Tu Firma</h4>
                  {selected.guest_signed ? (
                    <>
                      <span className="sig-icon">✓</span>
                      <p>Firmado el {new Date(selected.guest_signed_at).toLocaleString()}</p>
                    </>
                  ) : (
                    <span className="sig-pending">Pendiente</span>
                  )}
                </div>
                <div className={`sig-box ${selected.host_signed ? 'signed' : ''}`}>
                  <h4>Firma del Propietario</h4>
                  {selected.host_signed ? (
                    <>
                      <span className="sig-icon">✓</span>
                      <p>Firmado el {new Date(selected.host_signed_at).toLocaleString()}</p>
                    </>
                  ) : (
                    <span className="sig-pending">Pendiente</span>
                  )}
                </div>
              </div>

              {selected.extensions?.length > 0 && (
                <div className="detail-section">
                  <h3>Extensiones/Anexos</h3>
                  <ul>
                    {selected.extensions.map(e => (
                      <li key={e.id}>Extension hasta {e.new_end_date} - Bs. {e.additional_amount?.toLocaleString()}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {!selected.guest_signed && (
                <button onClick={handleSign} className="btn btn-primary" disabled={signing}>
                  {signing ? 'Firmando...' : 'Firmar Contrato'}
                </button>
              )}
              {selected.guest_signed && selected.host_signed && (
                <>
                  <button onClick={() => downloadPDF(selected.id)} className="btn btn-secondary">
                    <span style={{ marginRight: '0.5rem' }}>📄</span>Guardar PDF
                  </button>
                  <button onClick={() => {
                    const pdfWindow = window.open(`/api/contracts/${selected.id}/pdf`, '_blank')
                    pdfWindow.onload = () => pdfWindow.print()
                  }} className="btn btn-outline">
                    <span style={{ marginRight: '0.5rem' }}>🖨️</span>Imprimir
                  </button>
                </>
              )}
              <button onClick={() => setSelected(null)} className="btn btn-light">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientPayments() {
  const [payments, setPayments] = useState([])
  const [summary, setSummary] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ type: '', status: '' })

  useEffect(() => { loadPayments() }, [filter])

  const loadPayments = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter.type) params.append('type', filter.type)
    if (filter.status) params.append('status', filter.status)
    api.get(`/client/payments?${params}`).then(res => {
      setPayments(res.data.payments || [])
      setSummary(res.data.summary || {})
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mis Pagos</h1>

      <div className="client-stats-grid">
        <div className="stat-card">
          <h3>Total Pagado</h3>
          <div className="stat-value">Bs. {(summary.total_paid || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Pagos Completados</h3>
          <div className="stat-value">{summary.completed_count || 0}</div>
        </div>
        <div className="stat-card">
          <h3>Pagos Pendientes</h3>
          <div className="stat-value">{summary.pending_count || 0}</div>
        </div>
        <div className="stat-card stat-warning">
          <h3>Monto Pendiente</h3>
          <div className="stat-value">Bs. {(summary.pending_amount || 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="filters-bar">
        <select value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })}>
          <option value="">Todos los tipos</option>
          <option value="full">Pago Completo</option>
          <option value="partial">Pago Parcial</option>
          <option value="extension">Extension</option>
        </select>
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="completed">Completado</option>
          <option value="failed">Fallido</option>
        </select>
      </div>

      {payments.length > 0 ? (
        <table className="client-table">
          <thead>
            <tr><th>Fecha</th><th>Espacio</th><th>Tipo</th><th>Metodo</th><th>Monto</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td>{p.space_title}</td>
                <td>{p.payment_type === 'full' ? 'Pago Completo' : p.payment_type === 'extension' ? 'Extension' : p.payment_type}</td>
                <td>{p.payment_method}</td>
                <td>Bs. {(p.amount || 0).toLocaleString()}</td>
                <td><span className={`status-badge status-${p.status}`}>{p.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="no-data">No hay pagos registrados</p>
      )}
    </div>
  )
}

function ClientInvoices() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => { loadInvoices() }, [filter])

  const loadInvoices = () => {
    setLoading(true)
    const params = filter ? `?status=${filter}` : ''
    api.get(`/client/invoices${params}`).then(res => {
      setInvoices(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const downloadPDF = (id) => {
    window.open(`/api/invoices/${id}/pdf`, '_blank')
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mis Facturas</h1>
      <div className="siat-disclaimer">
        <strong>Aviso:</strong> Las facturas generadas por esta plataforma son comprobantes internos. 
        Para efectos fiscales ante el SIAT (Servicio de Impuestos Nacionales), 
        solicite la factura oficial al propietario del espacio.
      </div>

      <div className="filters-bar">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Todos</option>
          <option value="pending">Pendiente</option>
          <option value="paid">Pagada</option>
        </select>
      </div>

      {invoices.length > 0 ? (
        <table className="client-table">
          <thead>
            <tr><th>Numero</th><th>Contrato</th><th>Espacio</th><th>Monto</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td>{inv.invoice_number}</td>
                <td>{inv.contract_number}</td>
                <td>{inv.space_title}</td>
                <td>Bs. {inv.total_amount?.toLocaleString()}</td>
                <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                <td><span className={`status-badge status-${inv.status}`}>{inv.status}</span></td>
                <td>
                  <button onClick={() => downloadPDF(inv.id)} className="btn btn-sm">PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="no-data">No tienes facturas</p>
      )}
    </div>
  )
}

function ClientFavorites() {
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadFavorites() }, [])

  const loadFavorites = () => {
    setLoading(true)
    api.get('/client/favorites').then(res => {
      setFavorites(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const removeFavorite = async (spaceId) => {
    try {
      await api.delete(`/client/favorites/${spaceId}`)
      loadFavorites()
    } catch (error) {
      alert('Error al eliminar favorito')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mis Favoritos</h1>

      {favorites.length > 0 ? (
        <div className="favorites-grid">
          {favorites.map(f => (
            <div key={f.favorite_id} className="favorite-card">
              {f.photo_url && <img src={`/${f.photo_url}`} alt={f.title} className="fc-photo" />}
              <div className="fc-info">
                <h3>{f.title}</h3>
                <p className="fc-location">{f.city}, {f.department}</p>
                <p className="fc-type">{f.type}</p>
                <p className="fc-price">Bs. {f.price_per_day?.toLocaleString()}/dia</p>
                <div className="fc-actions">
                  <a href={`/espacios/${f.id}`} className="btn btn-sm btn-primary">Ver Espacio</a>
                  <button onClick={() => removeFavorite(f.id)} className="btn btn-sm btn-danger">Eliminar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-data-box">
          <h3>No tienes espacios favoritos</h3>
          <p>Explora los espacios disponibles y guarda tus favoritos para encontrarlos facilmente.</p>
          <a href="/espacios" className="btn btn-primary">Explorar Espacios</a>
        </div>
      )}
    </div>
  )
}

function ClientProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [changingPassword, setChangingPassword] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [resendingVerification, setResendingVerification] = useState(false)

  useEffect(() => { loadProfile() }, [])

  const loadProfile = () => {
    setLoading(true)
    api.get('/client/profile').then(res => {
      setProfile(res.data)
      setForm(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/client/profile', {
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        nit: form.nit,
        address: form.address,
        street_number: form.street_number,
        floor: form.floor,
        city: form.city,
        department: form.department,
        country: form.country,
        email_notifications: form.email_notifications ? true : false,
        newsletter: form.newsletter ? true : false
      })
      loadProfile()
      setEditing(false)
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setSaving(false)
  }

  const handleDeleteAccount = async () => {
    const confirmText = prompt('Para eliminar su cuenta permanentemente, escriba "ELIMINAR MI CUENTA":')
    if (confirmText !== 'ELIMINAR MI CUENTA') {
      alert('La confirmacion no coincide. La cuenta no fue eliminada.')
      return
    }
    
    try {
      await api.delete('/client/account')
      alert('Su cuenta ha sido eliminada permanentemente.')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/'
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no debe superar 2MB')
      return
    }

    setUploadingPhoto(true)
    const formData = new FormData()
    formData.append('photo', file)

    try {
      const res = await api.post('/client/profile/photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setProfile({ ...profile, profile_photo: res.data.photo_url })
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setUploadingPhoto(false)
  }

  const handleDeletePhoto = async () => {
    if (!confirm('Eliminar foto de perfil?')) return
    try {
      await api.delete('/client/profile/photo')
      setProfile({ ...profile, profile_photo: null })
    } catch (error) {
      alert('Error al eliminar foto')
    }
  }

  const handleChangePassword = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      alert('Las contrasenas no coinciden')
      return
    }
    if (passwordForm.new_password.length < 8) {
      alert('La contrasena debe tener al menos 8 caracteres')
      return
    }

    setChangingPassword(true)
    try {
      await api.put('/client/profile/password', passwordForm)
      alert('Contrasena actualizada exitosamente')
      setShowPasswordModal(false)
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setChangingPassword(false)
  }

  const handleResendVerification = async () => {
    setResendingVerification(true)
    try {
      await api.post('/auth/resend-verification')
      alert('Correo de verificacion enviado. Revisa tu bandeja de entrada.')
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setResendingVerification(false)
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>
  if (!profile) return <div>Error al cargar perfil</div>

  return (
    <div>
      <h1>Mi Perfil</h1>

      <div className="profile-header">
        <div className="profile-photo-section">
          {profile.profile_photo ? (
            <img src={`/${profile.profile_photo}`} alt="Foto de perfil" className="profile-photo" />
          ) : (
            <div className="profile-photo-placeholder">
              <span>{profile.first_name?.charAt(0)}{profile.last_name?.charAt(0)}</span>
            </div>
          )}
          <div className="photo-actions">
            <label className="btn btn-sm">
              {uploadingPhoto ? 'Subiendo...' : 'Cambiar Foto'}
              <input type="file" accept="image/jpeg,image/png" onChange={handlePhotoUpload} hidden />
            </label>
            {profile.profile_photo && (
              <button onClick={handleDeletePhoto} className="btn btn-sm btn-danger">Eliminar</button>
            )}
          </div>
        </div>
        <div className="profile-status">
          <div className={`verification-badge ${profile.is_verified ? 'verified' : ''}`}>
            {profile.is_verified ? '✓ Cuenta Verificada' : 'Cuenta No Verificada'}
          </div>
          {!profile.is_verified && (
            <button 
              onClick={handleResendVerification} 
              className="btn btn-sm btn-outline resend-verification-btn"
              disabled={resendingVerification}
            >
              {resendingVerification ? 'Enviando...' : 'Reenviar Correo de Verificacion'}
            </button>
          )}
          <div className={`anti-bypass-badge ${profile.anti_bypass_accepted ? 'accepted' : ''}`}>
            {profile.anti_bypass_accepted ? '✓ Clausula Anti-Bypass Aceptada' : 'Anti-Bypass Pendiente'}
          </div>
          <p className="member-since">Miembro desde: {new Date(profile.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="profile-form">
        <div className="form-section">
          <h3>Informacion Personal</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Nombre</label>
              {editing ? (
                <input value={form.first_name || ''} onChange={e => setForm({ ...form, first_name: e.target.value })} />
              ) : (
                <p>{profile.first_name}</p>
              )}
            </div>
            <div className="form-group">
              <label>Apellido</label>
              {editing ? (
                <input value={form.last_name || ''} onChange={e => setForm({ ...form, last_name: e.target.value })} />
              ) : (
                <p>{profile.last_name}</p>
              )}
            </div>
            <div className="form-group">
              <label>Email</label>
              <p>{profile.email}</p>
            </div>
            <div className="form-group">
              <label>Telefono</label>
              {editing ? (
                <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} />
              ) : (
                <p>{profile.phone || '-'}</p>
              )}
            </div>
            <div className="form-group">
              <label>CI</label>
              <p>{profile.ci || '-'}</p>
            </div>
            <div className="form-group">
              <label>NIT (opcional)</label>
              {editing ? (
                <input value={form.nit || ''} onChange={e => setForm({ ...form, nit: e.target.value })} placeholder="Numero de Identificacion Tributaria" />
              ) : (
                <p>{profile.nit || '-'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Direccion</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Direccion</label>
              {editing ? (
                <input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Calle, zona, etc." />
              ) : (
                <p>{profile.address || '-'}</p>
              )}
            </div>
            <div className="form-group">
              <label>Numero</label>
              {editing ? (
                <input value={form.street_number || ''} onChange={e => setForm({ ...form, street_number: e.target.value })} placeholder="Ej: 123" />
              ) : (
                <p>{profile.street_number || '-'}</p>
              )}
            </div>
            <div className="form-group">
              <label>Piso/Interior</label>
              {editing ? (
                <input value={form.floor || ''} onChange={e => setForm({ ...form, floor: e.target.value })} placeholder="Ej: 2do piso, Of. 5" />
              ) : (
                <p>{profile.floor || '-'}</p>
              )}
            </div>
            <div className="form-group">
              <label>Ciudad</label>
              {editing ? (
                <input value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} />
              ) : (
                <p>{profile.city || '-'}</p>
              )}
            </div>
            <div className="form-group">
              <label>Departamento</label>
              {editing ? (
                <select value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })}>
                  <option value="">Seleccionar</option>
                  <option value="La Paz">La Paz</option>
                  <option value="Santa Cruz">Santa Cruz</option>
                  <option value="Cochabamba">Cochabamba</option>
                  <option value="Oruro">Oruro</option>
                  <option value="Potosi">Potosi</option>
                  <option value="Tarija">Tarija</option>
                  <option value="Chuquisaca">Chuquisaca</option>
                  <option value="Beni">Beni</option>
                  <option value="Pando">Pando</option>
                </select>
              ) : (
                <p>{profile.department || '-'}</p>
              )}
            </div>
            <div className="form-group">
              <label>Pais</label>
              {editing ? (
                <input value={form.country || 'Bolivia'} onChange={e => setForm({ ...form, country: e.target.value })} />
              ) : (
                <p>{profile.country || 'Bolivia'}</p>
              )}
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Preferencias</h3>
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={form.email_notifications || false}
                onChange={e => setForm({ ...form, email_notifications: e.target.checked })}
                disabled={!editing}
              />
              Recibir notificaciones por email
            </label>
          </div>
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={form.newsletter || false}
                onChange={e => setForm({ ...form, newsletter: e.target.checked })}
                disabled={!editing}
              />
              Suscribirse al boletin informativo
            </label>
          </div>
        </div>

        <div className="form-actions">
          {editing ? (
            <>
              <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button onClick={() => { setEditing(false); setForm(profile) }} className="btn btn-secondary">Cancelar</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="btn btn-primary">Editar Perfil</button>
              <button onClick={() => setShowPasswordModal(true)} className="btn btn-secondary">Cambiar Contrasena</button>
            </>
          )}
        </div>

        <div className="form-section anti-bypass-section">
          <h3>Clausula Anti-Bypass</h3>
          <p className="anti-bypass-info">
            La Clausula Anti-Bypass es obligatoria para poder realizar reservaciones y contactar a los propietarios. 
            Al aceptar, se compromete a no realizar transacciones fuera de la plataforma.
          </p>
          {profile.anti_bypass_accepted ? (
            <div className="anti-bypass-status accepted">
              <span className="status-icon">✓</span>
              <div className="status-text">
                <strong>Clausula Aceptada</strong>
                <p className="accepted-info">Aceptada el: {new Date(profile.anti_bypass_accepted_at).toLocaleDateString()}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={form.anti_bypass_accepted || false}
                    onChange={e => setForm({ ...form, anti_bypass_accepted: e.target.checked })}
                    disabled={!editing}
                  />
                  Acepto la Clausula Anti-Bypass
                </label>
              </div>
              <p className="warning-info">No ha aceptado la clausula. No podra realizar reservaciones ni contactar propietarios.</p>
            </>
          )}
        </div>

        <div className="form-section danger-zone">
          <h3>Zona de Peligro</h3>
          <p>Eliminar su cuenta es una accion permanente e irreversible. Se eliminaran todos sus datos, reservaciones, contratos y cualquier informacion asociada a su cuenta.</p>
          <button onClick={handleDeleteAccount} className="btn btn-danger">Eliminar Mi Cuenta Permanentemente</button>
        </div>
      </div>

      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal password-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cambiar Contrasena</h2>
              <button className="close-btn" onClick={() => setShowPasswordModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Contrasena Actual</label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={e => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Nueva Contrasena</label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                />
                <small>Minimo 8 caracteres, incluir mayusculas, minusculas y numeros</small>
              </div>
              <div className="form-group">
                <label>Confirmar Nueva Contrasena</label>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={handleChangePassword} className="btn btn-primary" disabled={changingPassword}>
                {changingPassword ? 'Cambiando...' : 'Cambiar Contrasena'}
              </button>
              <button onClick={() => setShowPasswordModal(false)} className="btn btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientAppointments() {
  const [appointments, setAppointments] = useState([])
  const [reservations, setReservations] = useState([])
  const [availableSlots, setAvailableSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [selectedReservation, setSelectedReservation] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [schedulingLoading, setSchedulingLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showContractModal, setShowContractModal] = useState(false)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [selectedAppointmentForContract, setSelectedAppointmentForContract] = useState(null)
  const [contractReservationDetails, setContractReservationDetails] = useState(null)
  const [contractLoading, setContractLoading] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')
  const [paymentMethods, setPaymentMethods] = useState([])
  const [spaceDetails, setSpaceDetails] = useState(null)
  const [rentalConfig, setRentalConfig] = useState({ sqm: '', periodType: 'mes', periodQty: 1, startDate: '' })
  const [showAntiBypassModal, setShowAntiBypassModal] = useState(false)
  const [antiBypassText, setAntiBypassText] = useState(null)
  const [antiBypassAccepted, setAntiBypassAccepted] = useState(false)
  const [loadingAntiBypass, setLoadingAntiBypass] = useState(false)

  useEffect(() => {
    loadData()
    loadPaymentMethods()
  }, [])

  const loadPaymentMethods = async () => {
    try {
      const res = await api.get('/spaces/payment-methods')
      setPaymentMethods(res.data || [])
    } catch (error) {
      console.error('Error loading payment methods:', error)
      setPaymentMethods([])
    }
  }

  const loadData = async () => {
    try {
      const [aptsRes, resvRes] = await Promise.all([
        api.get('/client/appointments'),
        api.get('/client/reservations?status=PAID_DEPOSIT_ESCROW')
      ])
      setAppointments(aptsRes.data || [])
      setReservations(resvRes.data || [])
    } catch (error) {
      console.error('Error loading data:', error)
    }
    setLoading(false)
  }

  const handleOpenSchedule = async (reservation) => {
    setSelectedReservation(reservation)
    setSelectedSlot(null)
    setSchedulingLoading(true)
    setShowScheduleModal(true)
    try {
      const res = await api.get(`/client/reservations/${reservation.id}/available-slots`)
      setAvailableSlots(res.data.slots || [])
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
      setShowScheduleModal(false)
    }
    setSchedulingLoading(false)
  }

  const handleScheduleAppointment = async () => {
    if (!selectedSlot) return alert('Seleccione un horario')
    setLoadingAntiBypass(true)
    try {
      const res = await api.get('/legal/anti-bypass/GUEST')
      setAntiBypassText(res.data)
      setAntiBypassAccepted(false)
      setShowAntiBypassModal(true)
    } catch (error) {
      alert('Error al cargar clausula anti-bypass: ' + (error.response?.data?.error || error.message))
    }
    setLoadingAntiBypass(false)
  }

  const handleConfirmAppointmentWithAntiBypass = async () => {
    if (!antiBypassAccepted) return alert('Debe aceptar la clausula anti-bypass para continuar')
    setSchedulingLoading(true)
    try {
      const appointmentRes = await api.post(`/client/reservations/${selectedReservation.id}/appointments`, {
        scheduled_date: selectedSlot.date,
        scheduled_time: selectedSlot.time
      })
      const appointmentId = appointmentRes.data.id
      await api.post(`/appointments/${appointmentId}/accept-anti-bypass`)
      alert('Cita agendada exitosamente. La clausula anti-bypass ha sido aceptada.')
      setShowAntiBypassModal(false)
      setShowScheduleModal(false)
      setAntiBypassText(null)
      setAntiBypassAccepted(false)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setSchedulingLoading(false)
  }

  const handleGuestComplete = async (id) => {
    try {
      const res = await api.put(`/client/appointments/${id}/guest-complete`)
      alert(res.data.message)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleAcceptReschedule = async (id) => {
    if (!confirm('¿Confirma que acepta la nueva fecha propuesta por el propietario?')) return
    try {
      await api.put(`/appointments/${id}/accept-reschedule`)
      alert('Nueva fecha aceptada exitosamente.')
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleRejectReschedule = async (id) => {
    if (!confirm('¿Rechazar la nueva fecha propuesta? La cita sera cancelada.')) return
    try {
      await api.put(`/appointments/${id}/reject-reschedule`)
      alert('Reprogramacion rechazada.')
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleCloseContract = async (appointment) => {
    setSelectedAppointmentForContract(appointment)
    setSpaceDetails(null)
    setRentalConfig({ sqm: '', periodType: 'mes', periodQty: 1, startDate: '' })
    setSelectedPaymentMethod('')
    setShowContractModal(true)
    try {
      const res = await api.get(`/spaces/${appointment.space_id}`)
      setSpaceDetails(res.data)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setRentalConfig(prev => ({ 
        ...prev, 
        sqm: res.data.total_sqm || '',
        startDate: tomorrow.toISOString().split('T')[0]
      }))
    } catch (error) {
      console.error('Error cargando detalles del espacio:', error)
      alert('Error al cargar detalles del espacio')
      setShowContractModal(false)
    }
  }

  const calculateRentalTotal = () => {
    if (!spaceDetails || !rentalConfig.sqm || !rentalConfig.periodQty) return 0
    const sqm = parseFloat(rentalConfig.sqm) || 0
    const qty = parseInt(rentalConfig.periodQty) || 1
    let pricePerSqm = 0
    switch (rentalConfig.periodType) {
      case 'dia': pricePerSqm = spaceDetails.price_per_sqm_day || 0; break
      case 'semana': pricePerSqm = spaceDetails.price_per_sqm_week || 0; break
      case 'mes': pricePerSqm = spaceDetails.price_per_sqm_month || 0; break
      case 'trimestre': pricePerSqm = spaceDetails.price_per_sqm_quarter || 0; break
      case 'semestre': pricePerSqm = spaceDetails.price_per_sqm_semester || 0; break
      case 'ano': pricePerSqm = spaceDetails.price_per_sqm_year || 0; break
      default: pricePerSqm = spaceDetails.price_per_sqm_month || 0
    }
    return sqm * pricePerSqm * qty
  }

  const handleProposeContract = async () => {
    if (!spaceDetails) return
    const total = calculateRentalTotal()
    if (total <= 0) {
      alert('El monto total debe ser mayor a 0. Verifique la configuracion.')
      return
    }
    if (!rentalConfig.startDate) {
      alert('Debe seleccionar una fecha de inicio.')
      return
    }
    if (!selectedAppointmentForContract?.id) {
      alert('No se encontro la cita asociada.')
      return
    }
    setContractLoading(true)
    try {
      const res = await api.post('/contracts/propose', {
        appointment_id: selectedAppointmentForContract.id,
        sqm: parseFloat(rentalConfig.sqm),
        period_type: rentalConfig.periodType,
        period_quantity: parseInt(rentalConfig.periodQty),
        start_date: rentalConfig.startDate
      })
      alert('Propuesta de contrato enviada exitosamente.\n\n' + res.data.message + '\n\nRecibira una notificacion cuando el propietario apruebe su propuesta.')
      setShowContractModal(false)
      setSelectedAppointmentForContract(null)
      setSpaceDetails(null)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setContractLoading(false)
  }

  const getStatusLabel = (status) => ({
    'solicitada': 'Solicitada', 'aceptada': 'Aceptada', 'rechazada': 'Rechazada',
    'reprogramada': 'Reprogramada', 'realizada': 'Realizada', 'no_asistida': 'No Asistida', 'cancelada': 'Cancelada'
  }[status] || status)

  const groupSlotsByDate = (slots) => {
    const grouped = {}
    slots.forEach(s => {
      if (!grouped[s.date]) grouped[s.date] = { date: s.date, day_name: s.day_name, slots: [] }
      grouped[s.date].slots.push(s)
    })
    return Object.values(grouped)
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mis Citas</h1>

      {reservations.length > 0 && (
        <div className="pending-reservations-section" style={{ marginBottom: '2rem', padding: '1.5rem', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px' }}>
          <h3 style={{ color: '#92400e', marginBottom: '1rem' }}>Reservaciones pendientes de agendar cita</h3>
          <div className="reservation-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {reservations.map(r => (
              <div key={r.id} className="card" style={{ padding: '1rem', background: 'white' }}>
                <h4>{r.space_title}</h4>
                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>{r.city}, {r.department}</p>
                <p style={{ fontSize: '0.9rem' }}>{r.sqm_requested} m² - {r.period_quantity} {r.period_type}</p>
                <button onClick={() => handleOpenSchedule(r)} className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
                  Agendar Visita
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="appointments-section" style={{ marginTop: '2rem' }}>
        <h3 style={{ marginBottom: '1rem', color: '#0f172a' }}>Historial de Citas Programadas</h3>
        
        <div className="filter-tabs" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>
          Todas ({appointments.length})
        </button>
        <button className={`filter-btn ${statusFilter === 'solicitada' ? 'active' : ''}`} onClick={() => setStatusFilter('solicitada')}>
          Pendientes ({appointments.filter(a => a.status === 'solicitada').length})
        </button>
        <button className={`filter-btn ${statusFilter === 'aceptada' ? 'active' : ''}`} onClick={() => setStatusFilter('aceptada')}>
          Aceptadas ({appointments.filter(a => a.status === 'aceptada').length})
        </button>
        <button className={`filter-btn ${statusFilter === 'reprogramada' ? 'active' : ''}`} onClick={() => setStatusFilter('reprogramada')}>
          Reprogramadas ({appointments.filter(a => a.status === 'reprogramada').length})
        </button>
        <button className={`filter-btn ${statusFilter === 'realizada' ? 'active' : ''}`} onClick={() => setStatusFilter('realizada')}>
          Realizadas ({appointments.filter(a => a.status === 'realizada').length})
        </button>
        <button className={`filter-btn ${statusFilter === 'cancelada' ? 'active' : ''}`} onClick={() => setStatusFilter('cancelada')}>
          Canceladas ({appointments.filter(a => a.status === 'cancelada' || a.status === 'rechazada').length})
        </button>
      </div>

      {appointments.filter(a => statusFilter === 'all' || a.status === statusFilter || (statusFilter === 'cancelada' && (a.status === 'cancelada' || a.status === 'rechazada'))).length === 0 ? (
        <div className="empty-state">
          <p>No tienes citas {statusFilter !== 'all' ? `con estado "${getStatusLabel(statusFilter)}"` : 'programadas'}.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Espacio</th>
                <th>Propietario</th>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Estado</th>
                <th>Confirmacion</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {appointments.filter(a => statusFilter === 'all' || a.status === statusFilter || (statusFilter === 'cancelada' && (a.status === 'cancelada' || a.status === 'rechazada'))).map(apt => (
                <tr key={apt.id}>
                  <td>{apt.space_title || 'N/A'}</td>
                  <td>{apt.host_first_name} {apt.host_last_name}</td>
                  <td>{apt.scheduled_date ? new Date(apt.scheduled_date).toLocaleDateString() : 'N/A'}</td>
                  <td>{apt.scheduled_time || 'N/A'}</td>
                  <td><span className={`status-badge status-${apt.status}`}>{getStatusLabel(apt.status)}</span></td>
                  <td>
                    <span style={{marginRight: '0.5rem'}}>Host: {apt.host_accepted_at ? '✅' : '⏳'}</span>
                    <span>Tu: {apt.anti_bypass_guest_accepted ? '✅' : '⏳'}</span>
                  </td>
                  <td style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {apt.status === 'solicitada' && <span className="text-muted">Esperando que el propietario acepte</span>}
                    {apt.status === 'aceptada' && !apt.host_accepted_at && (
                      <span className="text-muted">Esperando que el propietario acepte la cita</span>
                    )}
                    {apt.status === 'reprogramada' && (
                      <>
                        <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                          Nueva fecha: {apt.reschedule_date ? new Date(apt.reschedule_date).toLocaleDateString() : 'N/A'} - {apt.reschedule_time || 'N/A'}
                        </div>
                        <button onClick={() => handleAcceptReschedule(apt.id)} className="btn btn-small btn-success">Aceptar</button>
                        <button onClick={() => handleRejectReschedule(apt.id)} className="btn btn-small btn-danger">Rechazar</button>
                      </>
                    )}
                    {apt.status === 'aceptada' && apt.host_accepted_at && apt.anti_bypass_guest_accepted && !apt.guest_completed && (
                      <button onClick={() => handleGuestComplete(apt.id)} className="btn btn-small btn-success">
                        Cita Realizada Fisicamente
                      </button>
                    )}
                    {apt.status === 'aceptada' && apt.guest_completed && !apt.host_completed && (
                      <span className="text-muted">Esperando confirmacion del propietario</span>
                    )}
                    {apt.status === 'realizada' && (
                      <button onClick={() => handleCloseContract(apt)} className="btn btn-small btn-primary">
                        Cerrar Contrato
                      </button>
                    )}
                    {apt.status === 'rechazada' && <span className="text-danger">Rechazada por propietario</span>}
                    {apt.status === 'cancelada' && <span className="text-muted">Cancelada</span>}
                    {apt.status === 'no_asistida' && <span className="text-warning">No asististe</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {showScheduleModal && (
        <div className="modal-overlay" onClick={() => setShowScheduleModal(false)}>
          <div className="modal schedule-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2>Agendar Visita</h2>
              <button className="close-btn" onClick={() => setShowScheduleModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {selectedReservation && (
                <div className="reservation-info" style={{ marginBottom: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                  <h4>{selectedReservation.space_title}</h4>
                  <p>{selectedReservation.city}, {selectedReservation.department}</p>
                </div>
              )}
              
              {schedulingLoading ? (
                <div className="loading"><div className="spinner"></div></div>
              ) : availableSlots.length === 0 ? (
                <div className="empty-state">
                  <p>No hay horarios disponibles en los proximos 30 dias.</p>
                  <p>El propietario puede no haber configurado su disponibilidad.</p>
                </div>
              ) : (
                <div className="slots-grid">
                  <p style={{ marginBottom: '1rem' }}>Seleccione una fecha y horario para su visita:</p>
                  {groupSlotsByDate(availableSlots).map(day => (
                    <div key={day.date} className="day-slots" style={{ marginBottom: '1rem' }}>
                      <h4 style={{ marginBottom: '0.5rem' }}>{day.day_name} - {new Date(day.date).toLocaleDateString()}</h4>
                      <div className="time-slots" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {day.slots.map((slot, i) => (
                          <button key={i} 
                            className={`slot-btn ${selectedSlot?.date === slot.date && selectedSlot?.time === slot.time ? 'selected' : ''}`}
                            onClick={() => setSelectedSlot(slot)}
                            style={{
                              padding: '0.5rem 1rem',
                              border: selectedSlot?.date === slot.date && selectedSlot?.time === slot.time ? '2px solid #1e3a8a' : '1px solid #d1d5db',
                              borderRadius: '4px',
                              background: selectedSlot?.date === slot.date && selectedSlot?.time === slot.time ? '#dbeafe' : 'white',
                              cursor: 'pointer'
                            }}>
                            {slot.time}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowScheduleModal(false)} className="btn btn-outline">Cancelar</button>
              <button onClick={handleScheduleAppointment} className="btn btn-primary" disabled={!selectedSlot || schedulingLoading}>
                {schedulingLoading ? 'Agendando...' : 'Confirmar Cita'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showContractModal && (
        <div className="modal-overlay" onClick={() => setShowContractModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h2>Proponer Contrato</h2>
              <button className="close-btn" onClick={() => setShowContractModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {spaceDetails ? (
                <>
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
                    <h4 style={{ marginBottom: '0.5rem' }}>{spaceDetails.title}</h4>
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{spaceDetails.city}, {spaceDetails.department}</p>
                    <p><strong>Superficie Total Disponible:</strong> {spaceDetails.total_sqm} m²</p>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label>Superficie a Alquilar (m²)</label>
                      <input 
                        type="number" 
                        value={rentalConfig.sqm}
                        onChange={e => setRentalConfig(prev => ({ ...prev, sqm: e.target.value }))}
                        max={spaceDetails.total_sqm}
                        min="1"
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Tipo de Periodo</label>
                      <select 
                        value={rentalConfig.periodType}
                        onChange={e => setRentalConfig(prev => ({ ...prev, periodType: e.target.value }))}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      >
                        <option value="dia">Dia {spaceDetails.price_per_sqm_day > 0 ? `(Bs. ${spaceDetails.price_per_sqm_day}/m²)` : '(Sin precio)'}</option>
                        <option value="semana">Semana {spaceDetails.price_per_sqm_week > 0 ? `(Bs. ${spaceDetails.price_per_sqm_week}/m²)` : '(Sin precio)'}</option>
                        <option value="mes">Mes {spaceDetails.price_per_sqm_month > 0 ? `(Bs. ${spaceDetails.price_per_sqm_month}/m²)` : '(Sin precio)'}</option>
                        <option value="trimestre">Trimestre {spaceDetails.price_per_sqm_quarter > 0 ? `(Bs. ${spaceDetails.price_per_sqm_quarter}/m²)` : '(Sin precio)'}</option>
                        <option value="semestre">Semestre {spaceDetails.price_per_sqm_semester > 0 ? `(Bs. ${spaceDetails.price_per_sqm_semester}/m²)` : '(Sin precio)'}</option>
                        <option value="ano">Ano {spaceDetails.price_per_sqm_year > 0 ? `(Bs. ${spaceDetails.price_per_sqm_year}/m²)` : '(Sin precio)'}</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div className="form-group">
                      <label>Cantidad de Periodos</label>
                      <input 
                        type="number" 
                        value={rentalConfig.periodQty}
                        onChange={e => setRentalConfig(prev => ({ ...prev, periodQty: e.target.value }))}
                        min="1"
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Fecha de Inicio</label>
                      <input 
                        type="date" 
                        value={rentalConfig.startDate}
                        onChange={e => setRentalConfig(prev => ({ ...prev, startDate: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                      />
                    </div>
                  </div>

                  {rentalConfig.startDate && rentalConfig.periodQty > 0 && (
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                      <label>Fecha de Vencimiento (calculada)</label>
                      <input 
                        type="text" 
                        readOnly
                        value={(() => {
                          const start = new Date(rentalConfig.startDate)
                          const qty = parseInt(rentalConfig.periodQty) || 1
                          let end = new Date(start)
                          switch (rentalConfig.periodType) {
                            case 'dia': end.setDate(end.getDate() + qty); break
                            case 'semana': end.setDate(end.getDate() + (qty * 7)); break
                            case 'mes': end.setMonth(end.getMonth() + qty); break
                            case 'trimestre': end.setMonth(end.getMonth() + (qty * 3)); break
                            case 'semestre': end.setMonth(end.getMonth() + (qty * 6)); break
                            case 'ano': end.setFullYear(end.getFullYear() + qty); break
                            default: end.setMonth(end.getMonth() + qty)
                          }
                          return end.toLocaleDateString('es-BO')
                        })()}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '6px', border: '1px solid #d1d5db', background: '#f3f4f6' }}
                      />
                    </div>
                  )}

                  <div style={{ padding: '1.25rem', background: '#e0f2fe', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #0284c7' }}>
                    <h4 style={{ marginBottom: '0.75rem', color: '#0369a1' }}>Resumen de la Propuesta</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.95rem' }}>
                      <p><strong>Espacio:</strong></p><p>{spaceDetails.title}</p>
                      <p><strong>Superficie:</strong></p><p>{rentalConfig.sqm || 0} m²</p>
                      <p><strong>Periodo:</strong></p><p>{rentalConfig.periodQty} {rentalConfig.periodType === 'dia' ? 'dia(s)' : rentalConfig.periodType === 'semana' ? 'semana(s)' : rentalConfig.periodType === 'mes' ? 'mes(es)' : rentalConfig.periodType === 'trimestre' ? 'trimestre(s)' : rentalConfig.periodType === 'semestre' ? 'semestre(s)' : 'ano(s)'}</p>
                      <p><strong>Precio por m²:</strong></p><p>Bs. {(() => {
                        switch (rentalConfig.periodType) {
                          case 'dia': return spaceDetails.price_per_sqm_day || 0
                          case 'semana': return spaceDetails.price_per_sqm_week || 0
                          case 'mes': return spaceDetails.price_per_sqm_month || 0
                          case 'trimestre': return spaceDetails.price_per_sqm_quarter || 0
                          case 'semestre': return spaceDetails.price_per_sqm_semester || 0
                          case 'ano': return spaceDetails.price_per_sqm_year || 0
                          default: return 0
                        }
                      })().toFixed(2)}</p>
                    </div>
                    <hr style={{ margin: '0.75rem 0', borderColor: '#0284c7' }} />
                    <p style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#0369a1', textAlign: 'center' }}>
                      MONTO TOTAL: Bs. {calculateRentalTotal().toFixed(2)}
                    </p>
                  </div>

                  {calculateRentalTotal() <= 0 && (
                    <div style={{ padding: '1rem', background: '#fef2f2', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #dc2626' }}>
                      <p style={{ fontSize: '0.9rem', color: '#dc2626' }}>
                        El espacio no tiene precio configurado para el tipo de periodo seleccionado. 
                        Por favor seleccione otro tipo de periodo o contacte al propietario.
                      </p>
                    </div>
                  )}

                  <div style={{ padding: '1rem', background: '#dbeafe', borderRadius: '8px', border: '1px solid #3b82f6' }}>
                    <p style={{ fontSize: '0.9rem', color: '#1e40af', marginBottom: '0.5rem' }}>
                      <strong>Flujo de contratacion:</strong>
                    </p>
                    <ol style={{ fontSize: '0.85rem', color: '#1e40af', paddingLeft: '1.25rem', margin: 0 }}>
                      <li>Usted envia esta propuesta al propietario</li>
                      <li>El propietario revisa y aprueba o rechaza</li>
                      <li>Si aprueba, recibira notificacion para realizar el pago</li>
                      <li>Despues del pago, ambos firman el contrato digitalmente</li>
                    </ol>
                  </div>
                </>
              ) : (
                <div className="loading"><div className="spinner"></div></div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowContractModal(false)} className="btn btn-outline">Cancelar</button>
              <button 
                onClick={handleProposeContract} 
                className="btn btn-primary" 
                disabled={contractLoading || calculateRentalTotal() <= 0 || !rentalConfig.startDate}
              >
                {contractLoading ? 'Enviando...' : 'Enviar Propuesta al Propietario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAntiBypassModal && (
        <div className="modal-overlay" onClick={() => setShowAntiBypassModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h2>Clausula Anti-Bypass</h2>
              <button className="close-btn" onClick={() => setShowAntiBypassModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.9rem', color: '#92400e', fontWeight: 'bold' }}>
                  Antes de confirmar su cita, debe leer y aceptar la siguiente clausula anti-bypass.
                </p>
              </div>
              
              {antiBypassText ? (
                <div style={{ 
                  maxHeight: '300px', 
                  overflowY: 'auto', 
                  padding: '1rem', 
                  background: '#f8fafc', 
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '1rem'
                }}>
                  <h4 style={{ marginBottom: '0.5rem' }}>{antiBypassText.title || 'Clausula Anti-Bypass'}</h4>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: '1.6' }}>
                    {antiBypassText.content}
                  </div>
                </div>
              ) : (
                <div className="loading"><div className="spinner"></div></div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1rem', background: '#f1f5f9', borderRadius: '8px' }}>
                <input 
                  type="checkbox" 
                  id="acceptAntiBypass"
                  checked={antiBypassAccepted}
                  onChange={(e) => setAntiBypassAccepted(e.target.checked)}
                  style={{ marginTop: '4px', width: '20px', height: '20px', cursor: 'pointer' }}
                />
                <label htmlFor="acceptAntiBypass" style={{ cursor: 'pointer', fontSize: '0.95rem' }}>
                  He leido y acepto la clausula anti-bypass. Entiendo que al aceptar me comprometo a realizar 
                  cualquier transaccion relacionada con este espacio exclusivamente a traves de esta plataforma.
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowAntiBypassModal(false); setAntiBypassAccepted(false); }} className="btn btn-outline">
                Cancelar
              </button>
              <button 
                onClick={handleConfirmAppointmentWithAntiBypass} 
                className="btn btn-primary" 
                disabled={!antiBypassAccepted || schedulingLoading}
              >
                {schedulingLoading ? 'Confirmando...' : 'Aceptar y Confirmar Cita'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClientSpaces() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSpaces()
  }, [])

  const loadSpaces = async () => {
    try {
      const res = await api.get('/client/my-spaces')
      setSpaces(res.data || [])
    } catch (error) {
      console.error('Error loading spaces:', error)
    }
    setLoading(false)
  }

  const getStatusLabel = (status) => {
    const labels = {
      'pending': 'Pendiente',
      'confirmed': 'Confirmada',
      'contract_pending': 'Contrato Pendiente',
      'contract_signed': 'Contrato Firmado',
      'completed': 'Completada',
      'cancelled': 'Cancelada',
      'rejected': 'Rechazada',
      'refunded': 'Reembolsada'
    }
    return labels[status] || status
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mis Espacios</h1>
      <p className="section-description">Espacios con los que has tenido interaccion (reservados, contratados, etc.).</p>

      {spaces.length === 0 ? (
        <div className="empty-state">
          <p>No tienes espacios en tu historial.</p>
          <p>Cuando realices reservaciones, los espacios apareceran aqui.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Espacio</th>
                <th>Ubicacion</th>
                <th>Propietario</th>
                <th>Ultima Reservacion</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {spaces.map(space => (
                <tr key={space.space_id}>
                  <td>{space.space_title}</td>
                  <td>{space.city}, {space.department}</td>
                  <td>{space.host_name}</td>
                  <td>{space.last_reservation_date ? new Date(space.last_reservation_date).toLocaleDateString() : 'N/A'}</td>
                  <td>
                    <span className={`status-badge status-${space.reservation_status}`}>
                      {getStatusLabel(space.reservation_status)}
                    </span>
                  </td>
                  <td>
                    <a href={`/espacios/${space.space_id}`} className="btn btn-primary btn-sm">
                      Ver Detalles
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ClientDashboard
