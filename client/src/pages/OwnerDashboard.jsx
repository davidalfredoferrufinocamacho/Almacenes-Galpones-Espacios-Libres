import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import './OwnerDashboard.css'

const api = axios.create({
  baseURL: '/api/owner',
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function OwnerDashboard() {
  const [activeSection, setActiveSection] = useState('dashboard')

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'spaces', label: 'Mis Espacios', icon: '🏢' },
    { id: 'reservations', label: 'Reservaciones', icon: '📅' },
    { id: 'payments', label: 'Pagos/Ingresos', icon: '💰' },
    { id: 'calendar', label: 'Calendario', icon: '📆' },
    { id: 'statements', label: 'Estados de Cuenta', icon: '📄' },
    { id: 'profile', label: 'Mi Perfil', icon: '👤' }
  ]

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard': return <OwnerHome />
      case 'spaces': return <OwnerSpaces />
      case 'reservations': return <OwnerReservations />
      case 'payments': return <OwnerPayments />
      case 'calendar': return <OwnerCalendar />
      case 'statements': return <OwnerStatements />
      case 'profile': return <OwnerProfile />
      default: return <OwnerHome />
    }
  }

  return (
    <div className="owner-dashboard">
      <aside className="owner-sidebar">
        <div className="owner-sidebar-header">
          <h2>Portal de Propietario</h2>
        </div>
        <nav className="owner-nav">
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`owner-nav-item ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="owner-main">
        {renderContent()}
      </main>
    </div>
  )
}

function OwnerHome() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/dashboard').then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>
  if (!data) return <div>Error al cargar datos</div>

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="owner-stats-grid">
        <div className="stat-card">
          <h3>Espacios</h3>
          <div className="stat-value">{data.spaces?.total || 0}</div>
          <div className="stat-detail">
            {data.spaces?.published || 0} publicados, {data.spaces?.draft || 0} borradores
          </div>
        </div>
        <div className="stat-card">
          <h3>Reservaciones</h3>
          <div className="stat-value">{data.reservations?.total || 0}</div>
          <div className="stat-detail">
            {data.reservations?.active || 0} activas, {data.reservations?.pending || 0} pendientes
          </div>
        </div>
        <div className="stat-card">
          <h3>Ingresos Totales</h3>
          <div className="stat-value">Bs. {(data.earnings?.total_earned || 0).toLocaleString()}</div>
          <div className="stat-detail">
            Bs. {(data.earnings?.in_escrow || 0).toLocaleString()} en deposito
          </div>
        </div>
        <div className="stat-card">
          <h3>Liberado</h3>
          <div className="stat-value">Bs. {(data.earnings?.released || 0).toLocaleString()}</div>
          <div className="stat-detail">Fondos disponibles</div>
        </div>
      </div>

      <div className="owner-section">
        <h2>Reservaciones Recientes</h2>
        {data.recentReservations?.length > 0 ? (
          <table className="owner-table">
            <thead>
              <tr><th>Espacio</th><th>Huesped</th><th>Fechas</th><th>Monto</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {data.recentReservations.map(r => (
                <tr key={r.id}>
                  <td>{r.space_title}</td>
                  <td>{r.guest_name}</td>
                  <td>{r.start_date} - {r.end_date}</td>
                  <td>Bs. {r.total_amount?.toLocaleString()}</td>
                  <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No hay reservaciones recientes</p>
        )}
      </div>

      {data.monthlyEarnings?.length > 0 && (
        <div className="owner-section">
          <h2>Ingresos Mensuales</h2>
          <div className="monthly-chart">
            {data.monthlyEarnings.slice(0, 6).reverse().map(m => (
              <div key={m.month} className="chart-bar">
                <div className="bar" style={{height: `${Math.min(100, (m.amount / Math.max(...data.monthlyEarnings.map(x => x.amount))) * 100)}%`}}></div>
                <div className="bar-label">{m.month}</div>
                <div className="bar-value">Bs. {m.amount?.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerSpaces() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadSpaces() }, [])

  const loadSpaces = () => {
    setLoading(true)
    api.get('/spaces').then(res => {
      setSpaces(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (form.id) {
        await api.put(`/spaces/${form.id}`, form)
      } else {
        await api.post('/spaces', form)
      }
      setShowModal(false)
      setForm({})
      loadSpaces()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setSaving(false)
  }

  const handlePublish = async (id) => {
    try {
      await api.put(`/spaces/${id}/publish`)
      loadSpaces()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleUnpublish = async (id) => {
    try {
      await api.put(`/spaces/${id}/unpublish`)
      loadSpaces()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleEdit = async (id) => {
    try {
      const res = await api.get(`/spaces/${id}`)
      setForm(res.data)
      setShowModal(true)
    } catch (error) {
      alert('Error al cargar espacio')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <div className="section-header">
        <h1>Mis Espacios</h1>
        <button onClick={() => { setForm({}); setShowModal(true) }} className="btn btn-primary">+ Nuevo Espacio</button>
      </div>

      {spaces.length > 0 ? (
        <div className="spaces-grid">
          {spaces.map(s => (
            <div key={s.id} className="space-card">
              <div className="space-card-header">
                <h3>{s.title}</h3>
                <span className={`status-badge status-${s.status}`}>{s.status}</span>
              </div>
              <div className="space-card-body">
                <p><strong>Tipo:</strong> {s.space_type}</p>
                <p><strong>Ciudad:</strong> {s.city}</p>
                <p><strong>Area:</strong> {s.area_m2} m2</p>
                <p><strong>Precio/mes:</strong> Bs. {s.price_per_month?.toLocaleString()}</p>
                <p><strong>Reservaciones:</strong> {s.reservations_count} ({s.active_reservations} activas)</p>
              </div>
              <div className="space-card-actions">
                <button onClick={() => handleEdit(s.id)} className="btn btn-small">Editar</button>
                {s.status === 'draft' ? (
                  <button onClick={() => handlePublish(s.id)} className="btn btn-small btn-success">Publicar</button>
                ) : (
                  <button onClick={() => handleUnpublish(s.id)} className="btn btn-small btn-warning">Despublicar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No tienes espacios registrados</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">Crear mi primer espacio</button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <h2>{form.id ? 'Editar' : 'Nuevo'} Espacio</h2>
            <form onSubmit={handleSave}>
              <div className="form-row">
                <div className="form-group">
                  <label>Titulo *</label>
                  <input type="text" value={form.title || ''} onChange={e => setForm({...form, title: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Tipo de Espacio</label>
                  <select value={form.space_type || 'warehouse'} onChange={e => setForm({...form, space_type: e.target.value})}>
                    <option value="warehouse">Almacen</option>
                    <option value="shed">Galpon</option>
                    <option value="open_space">Espacio Libre</option>
                    <option value="office">Oficina</option>
                    <option value="parking">Estacionamiento</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Descripcion *</label>
                <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} rows="3" required></textarea>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Precio por Mes (Bs.) *</label>
                  <input type="number" value={form.price_per_month || ''} onChange={e => setForm({...form, price_per_month: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Precio por Dia (Bs.)</label>
                  <input type="number" value={form.price_per_day || ''} onChange={e => setForm({...form, price_per_day: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Area (m2) *</label>
                  <input type="number" value={form.area_m2 || ''} onChange={e => setForm({...form, area_m2: e.target.value})} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Ciudad *</label>
                  <input type="text" value={form.city || ''} onChange={e => setForm({...form, city: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Departamento</label>
                  <select value={form.department || ''} onChange={e => setForm({...form, department: e.target.value})}>
                    <option value="">Seleccionar...</option>
                    <option value="La Paz">La Paz</option>
                    <option value="Cochabamba">Cochabamba</option>
                    <option value="Santa Cruz">Santa Cruz</option>
                    <option value="Oruro">Oruro</option>
                    <option value="Potosi">Potosi</option>
                    <option value="Tarija">Tarija</option>
                    <option value="Chuquisaca">Chuquisaca</option>
                    <option value="Beni">Beni</option>
                    <option value="Pando">Pando</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Calle</label>
                  <input type="text" value={form.street || ''} onChange={e => setForm({...form, street: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Numero</label>
                  <input type="text" value={form.street_number || ''} onChange={e => setForm({...form, street_number: e.target.value})} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Latitud</label>
                  <input type="text" value={form.latitude || ''} onChange={e => setForm({...form, latitude: e.target.value})} placeholder="-16.5000" />
                </div>
                <div className="form-group">
                  <label>Longitud</label>
                  <input type="text" value={form.longitude || ''} onChange={e => setForm({...form, longitude: e.target.value})} placeholder="-68.1500" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Min. Dias Alquiler</label>
                  <input type="number" value={form.min_rental_days || 30} onChange={e => setForm({...form, min_rental_days: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Max. Dias Alquiler</label>
                  <input type="number" value={form.max_rental_days || ''} onChange={e => setForm({...form, max_rental_days: e.target.value})} placeholder="Sin limite" />
                </div>
              </div>
              <div className="form-group">
                <label>Amenidades (separadas por coma)</label>
                <input type="text" value={form.amenities || ''} onChange={e => setForm({...form, amenities: e.target.value})} placeholder="Vigilancia, Electricidad, Agua" />
              </div>
              <div className="form-group">
                <label>Reglas</label>
                <textarea value={form.rules || ''} onChange={e => setForm({...form, rules: e.target.value})} rows="2" placeholder="Reglas del espacio..."></textarea>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerReservations() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => { loadData() }, [filterStatus])

  const loadData = () => {
    setLoading(true)
    const url = filterStatus ? `/reservations?status=${filterStatus}` : '/reservations'
    api.get(url).then(res => {
      setReservations(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const viewDetails = async (id) => {
    try {
      const res = await api.get(`/reservations/${id}`)
      setSelected(res.data)
    } catch (error) {
      alert('Error al cargar detalles')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Reservaciones</h1>
      
      <div className="filters-bar">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="confirmed">Confirmada</option>
          <option value="contract_pending">Contrato Pendiente</option>
          <option value="contract_signed">Contrato Firmado</option>
          <option value="completed">Completada</option>
          <option value="cancelled">Cancelada</option>
        </select>
      </div>

      {reservations.length > 0 ? (
        <table className="owner-table">
          <thead>
            <tr>
              <th>Espacio</th>
              <th>Huesped</th>
              <th>Contacto</th>
              <th>Fechas</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map(r => (
              <tr key={r.id}>
                <td>{r.space_title}</td>
                <td>{r.guest_name}</td>
                <td>{r.guest_email}</td>
                <td>{r.start_date} - {r.end_date}</td>
                <td>Bs. {r.total_amount?.toLocaleString()}</td>
                <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                <td>
                  <button onClick={() => viewDetails(r.id)} className="btn btn-small">Ver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay reservaciones</p>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Detalle de Reservacion</h2>
            <div className="detail-grid">
              <div><strong>Espacio:</strong> {selected.space_title}</div>
              <div><strong>Ciudad:</strong> {selected.space_city}</div>
              <div><strong>Huesped:</strong> {selected.guest_name}</div>
              <div><strong>Email:</strong> {selected.guest_email}</div>
              <div><strong>Telefono:</strong> {selected.guest_phone || 'N/A'}</div>
              <div><strong>Fechas:</strong> {selected.start_date} - {selected.end_date}</div>
              <div><strong>Monto Total:</strong> Bs. {selected.total_amount?.toLocaleString()}</div>
              <div><strong>Deposito:</strong> Bs. {selected.deposit_amount?.toLocaleString()}</div>
              <div><strong>Comision:</strong> Bs. {selected.commission_amount?.toLocaleString()}</div>
              <div><strong>Estado:</strong> <span className={`status-badge status-${selected.status}`}>{selected.status}</span></div>
            </div>
            {selected.payments?.length > 0 && (
              <div style={{marginTop: '1rem'}}>
                <h3>Pagos</h3>
                <table className="owner-table">
                  <thead>
                    <tr><th>Tipo</th><th>Monto</th><th>Estado</th><th>Escrow</th><th>Fecha</th></tr>
                  </thead>
                  <tbody>
                    {selected.payments.map(p => (
                      <tr key={p.id}>
                        <td>{p.payment_type}</td>
                        <td>Bs. {p.amount?.toLocaleString()}</td>
                        <td>{p.status}</td>
                        <td>{p.escrow_status}</td>
                        <td>{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={() => setSelected(null)} className="btn btn-secondary" style={{marginTop: '1rem'}}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerPayments() {
  const [data, setData] = useState({ payments: [], summary: {} })
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => { loadData() }, [filterStatus])

  const loadData = () => {
    setLoading(true)
    const url = filterStatus ? `/payments?status=${filterStatus}` : '/payments'
    api.get(url).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Pagos e Ingresos</h1>

      <div className="owner-stats-grid" style={{marginBottom: '1.5rem'}}>
        <div className="stat-card">
          <h3>Total Recibido</h3>
          <div className="stat-value">Bs. {(data.summary?.total_received || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>En Deposito (Escrow)</h3>
          <div className="stat-value">Bs. {(data.summary?.in_escrow || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Liberado</h3>
          <div className="stat-value">Bs. {(data.summary?.released || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Transacciones</h3>
          <div className="stat-value">{data.summary?.total_transactions || 0}</div>
        </div>
      </div>

      <div className="filters-bar">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="completed">Completado</option>
          <option value="failed">Fallido</option>
        </select>
      </div>

      {data.payments?.length > 0 ? (
        <table className="owner-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Espacio</th>
              <th>Huesped</th>
              <th>Tipo</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Escrow</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map(p => (
              <tr key={p.id}>
                <td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td>{p.space_title}</td>
                <td>{p.guest_name}</td>
                <td>{p.payment_type}</td>
                <td>Bs. {p.amount?.toLocaleString()}</td>
                <td><span className={`status-badge status-${p.status}`}>{p.status}</span></td>
                <td><span className={`status-badge status-${p.escrow_status}`}>{p.escrow_status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay pagos registrados</p>
        </div>
      )}
    </div>
  )
}

function OwnerCalendar() {
  const [data, setData] = useState({ events: [], spaces: [] })
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => { loadData() }, [year, month])

  const loadData = () => {
    setLoading(true)
    api.get(`/calendar?year=${year}&month=${month}`).then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDay = new Date(year, month - 1, 1).getDay()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const blanks = Array.from({ length: firstDay }, (_, i) => i)

  const getEventsForDay = (day) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return data.events.filter(e => e.start_date <= dateStr && e.end_date >= dateStr)
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Calendario de Ocupacion</h1>
      
      <div className="calendar-controls">
        <button onClick={() => { if (month === 1) { setMonth(12); setYear(year - 1) } else setMonth(month - 1) }} className="btn btn-small">&lt;</button>
        <span className="calendar-month">{new Date(year, month - 1).toLocaleString('es', { month: 'long', year: 'numeric' })}</span>
        <button onClick={() => { if (month === 12) { setMonth(1); setYear(year + 1) } else setMonth(month + 1) }} className="btn btn-small">&gt;</button>
      </div>

      <div className="calendar-grid">
        <div className="calendar-header">
          {['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map(d => (
            <div key={d} className="calendar-day-name">{d}</div>
          ))}
        </div>
        <div className="calendar-body">
          {blanks.map(b => <div key={`blank-${b}`} className="calendar-day empty"></div>)}
          {days.map(day => {
            const events = getEventsForDay(day)
            return (
              <div key={day} className={`calendar-day ${events.length > 0 ? 'has-events' : ''}`}>
                <span className="day-number">{day}</span>
                {events.slice(0, 2).map(e => (
                  <div key={e.id} className={`calendar-event status-${e.status}`} title={`${e.space_title} - ${e.guest_name}`}>
                    {e.space_title?.substring(0, 10)}
                  </div>
                ))}
                {events.length > 2 && <div className="more-events">+{events.length - 2} mas</div>}
              </div>
            )
          })}
        </div>
      </div>

      {data.spaces?.length > 0 && (
        <div className="owner-section" style={{marginTop: '1.5rem'}}>
          <h3>Espacios Publicados</h3>
          <div className="space-list">
            {data.spaces.map(s => (
              <span key={s.id} className="space-tag">{s.title}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerStatements() {
  const [statements, setStatements] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    api.get('/statements').then(res => {
      setStatements(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const viewDetails = async (id) => {
    try {
      const res = await api.get(`/statements/${id}`)
      setSelected(res.data)
    } catch (error) {
      alert('Error al cargar estado de cuenta')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Estados de Cuenta</h1>
      
      {statements.length > 0 ? (
        <table className="owner-table">
          <thead>
            <tr>
              <th>Periodo</th>
              <th>Reservaciones</th>
              <th>Ingresos Brutos</th>
              <th>Comisiones</th>
              <th>Neto a Pagar</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {statements.map(s => (
              <tr key={s.id}>
                <td>{s.period_start} - {s.period_end}</td>
                <td>{s.total_reservations}</td>
                <td>Bs. {s.gross_earnings?.toLocaleString()}</td>
                <td>Bs. {s.total_commissions?.toLocaleString()}</td>
                <td>Bs. {s.net_payout?.toLocaleString()}</td>
                <td><span className={`status-badge status-${s.status}`}>{s.status}</span></td>
                <td><button onClick={() => viewDetails(s.id)} className="btn btn-small">Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay estados de cuenta generados</p>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Estado de Cuenta</h2>
            <div className="detail-grid">
              <div><strong>Periodo:</strong> {selected.period_start} - {selected.period_end}</div>
              <div><strong>Reservaciones:</strong> {selected.total_reservations}</div>
              <div><strong>Ingresos Brutos:</strong> Bs. {selected.gross_earnings?.toLocaleString()}</div>
              <div><strong>Comisiones:</strong> Bs. {selected.total_commissions?.toLocaleString()}</div>
              <div><strong>Retenciones:</strong> Bs. {selected.total_withholdings?.toLocaleString()}</div>
              <div><strong>Neto a Pagar:</strong> Bs. {selected.net_payout?.toLocaleString()}</div>
              <div><strong>Estado:</strong> {selected.status}</div>
              <div><strong>Fecha Pago:</strong> {selected.paid_at || 'Pendiente'}</div>
            </div>
            <button onClick={() => setSelected(null)} className="btn btn-secondary" style={{marginTop: '1rem'}}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function OwnerProfile() {
  const navigate = useNavigate()
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
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)

  useEffect(() => { loadProfile() }, [])

  const loadProfile = () => {
    api.get('/owner/profile').then(res => {
      setProfile(res.data)
      setForm(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/owner/profile', {
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
        email_notifications: form.email_notifications,
        newsletter: form.newsletter
      })
      loadProfile()
      setEditing(false)
      alert('Perfil actualizado exitosamente')
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setSaving(false)
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
      const res = await api.post('/owner/profile/photo', formData, {
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
      await api.delete('/owner/profile/photo')
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
      await api.put('/owner/profile/password', passwordForm)
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

  const handleDeleteAccount = async () => {
    if (!confirm('Esta seguro que desea eliminar su cuenta? Esta accion es IRREVERSIBLE.')) return

    setDeletingAccount(true)
    try {
      await api.delete('/owner/account')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      alert('Cuenta eliminada exitosamente')
      navigate('/')
      window.location.reload()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setDeletingAccount(false)
    setShowDeleteModal(false)
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
              <label>Tipo</label>
              <p>{profile.person_type === 'natural' ? 'Persona Natural' : 'Empresa'}</p>
            </div>
            {profile.company_name && (
              <div className="form-group">
                <label>Empresa</label>
                <p>{profile.company_name}</p>
              </div>
            )}
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
                  <option value="">Seleccione</option>
                  <option value="La Paz">La Paz</option>
                  <option value="Cochabamba">Cochabamba</option>
                  <option value="Santa Cruz">Santa Cruz</option>
                  <option value="Oruro">Oruro</option>
                  <option value="Potosi">Potosi</option>
                  <option value="Chuquisaca">Chuquisaca</option>
                  <option value="Tarija">Tarija</option>
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
          <h3>Preferencias de Notificacion</h3>
          <div className="form-grid">
            <div className="form-group checkbox-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={editing ? (form.email_notifications || false) : (profile.email_notifications || false)}
                  disabled={!editing}
                  onChange={e => setForm({ ...form, email_notifications: e.target.checked })}
                />
                Recibir notificaciones por email
              </label>
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={editing ? (form.newsletter || false) : (profile.newsletter || false)}
                  disabled={!editing}
                  onChange={e => setForm({ ...form, newsletter: e.target.checked })}
                />
                Suscribirse al boletin informativo
              </label>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3>Clausula Anti-Bypass</h3>
          {profile.anti_bypass_accepted ? (
            <div className="anti-bypass-status accepted">
              <span className="status-icon">✓</span>
              <div className="status-text">
                <strong>Clausula Aceptada</strong>
                <p className="accepted-info">Aceptada el: {new Date(profile.anti_bypass_accepted_at).toLocaleDateString()}</p>
              </div>
            </div>
          ) : (
            <div className="anti-bypass-status pending">
              <span className="status-icon">⚠</span>
              <div className="status-text">
                <strong>Pendiente de Aceptacion</strong>
                <p>Debe aceptar la clausula anti-bypass para publicar espacios.</p>
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          {editing ? (
            <>
              <button onClick={handleSave} className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button onClick={() => { setEditing(false); setForm(profile) }} className="btn btn-secondary">
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="btn btn-primary">
                Editar Perfil
              </button>
              <button onClick={() => setShowPasswordModal(true)} className="btn btn-secondary">
                Cambiar Contrasena
              </button>
            </>
          )}
        </div>
      </div>

      {profile.verification && (
        <div className="profile-section" style={{marginTop: '2rem'}}>
          <h2>Estado de Verificacion de Documentos</h2>
          <div className="detail-grid">
            <div><strong>Estado:</strong> <span className={`status-badge status-${profile.verification.status}`}>{profile.verification.status}</span></div>
            <div><strong>Tipo Documento:</strong> {profile.verification.document_type}</div>
            <div><strong>Fecha Solicitud:</strong> {new Date(profile.verification.created_at).toLocaleDateString()}</div>
            {profile.verification.reviewed_at && <div><strong>Fecha Revision:</strong> {new Date(profile.verification.reviewed_at).toLocaleDateString()}</div>}
            {profile.verification.rejection_reason && <div><strong>Motivo Rechazo:</strong> {profile.verification.rejection_reason}</div>}
          </div>
        </div>
      )}

      {profile.badges?.length > 0 && (
        <div className="profile-section" style={{marginTop: '2rem'}}>
          <h2>Insignias Obtenidas</h2>
          <div className="badges-grid">
            {profile.badges.map(b => (
              <div key={b.id} className="badge-card">
                <span className="badge-icon">{b.icon}</span>
                <span className="badge-name">{b.name}</span>
                <span className="badge-desc">{b.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="danger-zone" style={{marginTop: '2rem'}}>
        <h3>Zona de Peligro</h3>
        <p>La eliminacion de la cuenta es permanente y no se puede deshacer.</p>
        <button onClick={() => setShowDeleteModal(true)} className="btn btn-danger">
          Eliminar Mi Cuenta
        </button>
      </div>

      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Cambiar Contrasena</h2>
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
              <small>Minimo 8 caracteres, con mayuscula, minuscula y numero</small>
            </div>
            <div className="form-group">
              <label>Confirmar Nueva Contrasena</label>
              <input 
                type="password" 
                value={passwordForm.confirm_password}
                onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button onClick={handleChangePassword} className="btn btn-primary" disabled={changingPassword}>
                {changingPassword ? 'Cambiando...' : 'Cambiar Contrasena'}
              </button>
              <button onClick={() => setShowPasswordModal(false)} className="btn btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Eliminar Cuenta</h2>
            <p style={{color: '#dc2626', fontWeight: 'bold'}}>
              Esta accion eliminara permanentemente su cuenta y todos sus datos.
            </p>
            <p>No podra recuperar su cuenta despues de eliminarla.</p>
            <p>Sus espacios seran marcados como eliminados.</p>
            <div className="modal-actions">
              <button onClick={handleDeleteAccount} className="btn btn-danger" disabled={deletingAccount}>
                {deletingAccount ? 'Eliminando...' : 'Si, Eliminar Mi Cuenta'}
              </button>
              <button onClick={() => setShowDeleteModal(false)} className="btn btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OwnerDashboard
