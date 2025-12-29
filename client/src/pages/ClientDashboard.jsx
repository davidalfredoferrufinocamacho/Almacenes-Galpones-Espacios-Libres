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
    PAID_DEPOSIT_ESCROW: 'Anticipo Pagado',
    appointment_scheduled: 'Cita Agendada',
    visit_completed: 'Visita Realizada',
    confirmed: 'Confirmado',
    contract_pending: 'Contrato Pendiente',
    contract_signed: 'Contrato Firmado',
    completed: 'Completado',
    cancelled: 'Cancelado',
    refunded: 'Reembolsado'
  }

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
    try {
      await api.post(`/payments/remaining/${id}`, { payment_method: 'card' })
      loadReservations()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al procesar pago')
    }
  }

  const handleRefund = async (id) => {
    if (!confirm('Esta seguro de solicitar el reembolso? Esta accion no se puede deshacer.')) return
    try {
      await api.post(`/payments/refund/${id}`)
      loadReservations()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al procesar reembolso')
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
          <option value="PAID_DEPOSIT_ESCROW">Anticipo Pagado</option>
          <option value="appointment_scheduled">Cita Agendada</option>
          <option value="visit_completed">Visita Realizada</option>
          <option value="confirmed">Confirmada</option>
          <option value="contract_pending">Contrato Pendiente</option>
          <option value="contract_signed">Contrato Firmado</option>
          <option value="completed">Completada</option>
          <option value="cancelled">Cancelada</option>
          <option value="refunded">Reembolsada</option>
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
                <div className="detail">
                  <span className="label">Anticipo:</span>
                  <span className="deposit">Bs. {r.deposit_amount?.toFixed(2)}</span>
                </div>
                <div className="detail">
                  <span className="label">Saldo:</span>
                  <span>Bs. {r.remaining_amount?.toFixed(2)}</span>
                </div>
              </div>
              <div className="reservation-actions">
                {r.status === 'PAID_DEPOSIT_ESCROW' && (
                  <>
                    <button onClick={() => window.location.href = `/citas?reservation=${r.id}`} className="btn btn-secondary">
                      Agendar Cita
                    </button>
                    <button onClick={() => handlePayRemaining(r.id)} className="btn btn-primary">
                      Pagar Saldo (Sin Visita)
                    </button>
                    <button onClick={() => handleRefund(r.id)} className="btn btn-outline-danger">
                      No me interesa (Reembolso)
                    </button>
                  </>
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
                    <h4>Saldo Pendiente</h4>
                    <p>Bs. {selected.remaining_amount?.toLocaleString()}</p>
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
              {['pending', 'confirmed'].includes(selected.status) && (
                <button onClick={() => handleCancel(selected.id)} className="btn btn-danger">Cancelar Reservacion</button>
              )}
              <button onClick={() => setSelected(null)} className="btn btn-secondary">Cerrar</button>
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

  useEffect(() => { loadContracts() }, [filter])

  const loadContracts = () => {
    setLoading(true)
    const params = filter ? `?status=${filter}` : ''
    api.get(`/client/contracts${params}`).then(res => {
      setContracts(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
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

  const downloadPDF = (id) => {
    window.open(`/api/contracts/${id}/pdf`, '_blank')
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mis Contratos</h1>
      <div className="filters-bar">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Todos</option>
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
                <button onClick={() => downloadPDF(selected.id)} className="btn btn-secondary">Descargar PDF</button>
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
          <h3>Depositos</h3>
          <div className="stat-value">Bs. {(summary.total_deposits || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Reembolsos</h3>
          <div className="stat-value">Bs. {(summary.total_refunds || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card stat-warning">
          <h3>Pendiente</h3>
          <div className="stat-value">Bs. {(summary.pending_amount || 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="filters-bar">
        <select value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })}>
          <option value="">Todos los tipos</option>
          <option value="deposit">Deposito</option>
          <option value="partial">Pago Parcial</option>
          <option value="full">Pago Completo</option>
          <option value="refund">Reembolso</option>
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
                <td>{p.payment_type}</td>
                <td>{p.payment_method}</td>
                <td className={p.payment_type === 'refund' ? 'amount-negative' : ''}>
                  {p.payment_type === 'refund' ? '-' : ''}Bs. {Math.abs(p.amount || 0).toLocaleString()}
                </td>
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAppointments()
  }, [])

  const loadAppointments = async () => {
    try {
      const res = await api.get('/client/appointments')
      setAppointments(res.data || [])
    } catch (error) {
      console.error('Error loading appointments:', error)
    }
    setLoading(false)
  }

  const getStatusLabel = (status) => {
    const labels = {
      'solicitada': 'Solicitada',
      'aceptada': 'Aceptada',
      'rechazada': 'Rechazada',
      'reprogramada': 'Reprogramada',
      'realizada': 'Realizada',
      'no_asistida': 'No Asistida'
    }
    return labels[status] || status
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Citas</h1>

      {appointments.length === 0 ? (
        <div className="empty-state">
          <p>No tienes citas programadas.</p>
          <p>Puedes solicitar citas para visitar espacios desde la seccion de Espacios.</p>
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
              </tr>
            </thead>
            <tbody>
              {appointments.map(apt => (
                <tr key={apt.id}>
                  <td>{apt.space_title || 'N/A'}</td>
                  <td>{apt.host_name || 'N/A'}</td>
                  <td>{apt.date ? new Date(apt.date).toLocaleDateString() : 'N/A'}</td>
                  <td>{apt.time || 'N/A'}</td>
                  <td>
                    <span className={`status-badge status-${apt.status}`}>
                      {getStatusLabel(apt.status)}
                    </span>
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
