import { useState, useEffect } from 'react'
import api from '../services/api'
import './AdminDashboard.css'

function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('dashboard')

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

  const menuItems = [
    { label: 'Dashboard', key: 'dashboard' },
    { label: 'Usuarios', key: 'users' },
    { label: 'Espacios', key: 'spaces' },
    { label: 'Reservaciones', key: 'reservations' },
    { label: 'Contratos', key: 'contracts' },
    { label: 'Pagos', key: 'payments' },
    { label: 'Facturas', key: 'invoices' },
    { label: 'Configuracion', key: 'config' },
    { label: 'Textos Legales', key: 'legal-texts' },
    { label: 'Notificaciones', key: 'notifications' },
    { label: 'Auditoria', key: 'audit-log' },
    { label: 'Contabilidad', key: 'accounting' },
    { label: 'Exportar', key: 'export' },
    { label: 'Mensajes', key: 'messages' },
  ]

  const renderContent = () => {
    switch (activeSection) {
      case 'users': return <AdminUsers />
      case 'spaces': return <AdminSpaces />
      case 'reservations': return <AdminReservations />
      case 'contracts': return <AdminContracts />
      case 'payments': return <AdminPayments />
      case 'invoices': return <AdminInvoices />
      case 'config': return <AdminConfig />
      case 'legal-texts': return <AdminLegalTexts />
      case 'notifications': return <AdminNotificationTemplates />
      case 'audit-log': return <AdminAuditLog />
      case 'accounting': return <AdminAccounting />
      case 'export': return <AdminExport />
      case 'messages': return <AdminMessages />
      default: return <AdminOverview stats={stats} onNavigate={setActiveSection} />
    }
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-sidebar">
        <h2>Panel Admin</h2>
        <nav>
          {menuItems.map(item => (
            <button 
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              className={activeSection === item.key ? 'active' : ''}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="admin-content">
        {renderContent()}
      </div>
    </div>
  )
}

function AdminOverview({ stats, onNavigate }) {
  return (
    <div className="admin-overview">
      <h1>Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card card clickable" onClick={() => onNavigate('users')}>
          <h3>Usuarios</h3>
          <p className="stat-number">{stats?.users?.total || 0}</p>
          <span>GUEST: {stats?.users?.guests || 0} | HOST: {stats?.users?.hosts || 0}</span>
          <small className="card-link">Ver todos →</small>
        </div>
        <div className="stat-card card clickable" onClick={() => onNavigate('spaces')}>
          <h3>Espacios</h3>
          <p className="stat-number">{stats?.spaces?.total || 0}</p>
          <span>Publicados: {stats?.spaces?.published || 0}</span>
          <small className="card-link">Ver todos →</small>
        </div>
        <div className="stat-card card clickable" onClick={() => onNavigate('reservations')}>
          <h3>Reservaciones</h3>
          <p className="stat-number">{stats?.reservations?.total || 0}</p>
          <span>Activas: {stats?.reservations?.active || 0}</span>
          <small className="card-link">Ver todas →</small>
        </div>
        <div className="stat-card card clickable" onClick={() => onNavigate('contracts')}>
          <h3>Contratos</h3>
          <p className="stat-number">{stats?.contracts?.total || 0}</p>
          <span>Firmados: {stats?.contracts?.signed || 0}</span>
          <small className="card-link">Ver todos →</small>
        </div>
        <div className="stat-card card clickable" onClick={() => onNavigate('payments')}>
          <h3>Escrow Retenido</h3>
          <p className="stat-number">Bs. {stats?.payments?.escrow_held?.toFixed(2) || '0.00'}</p>
          <span>En espera de liberacion</span>
          <small className="card-link">Ver pagos →</small>
        </div>
        <div className="stat-card card clickable" onClick={() => onNavigate('accounting')}>
          <h3>Comisiones</h3>
          <p className="stat-number">Bs. {stats?.commissions?.total?.toFixed(2) || '0.00'}</p>
          <span>Total ganado</span>
          <small className="card-link">Ver contabilidad →</small>
        </div>
      </div>
    </div>
  )
}

function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ role: '', status: '' })

  const loadUsers = () => {
    api.get('/admin/users').then(r => setUsers(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadUsers() }, [])

  const toggleStatus = async (userId, currentActive) => {
    try {
      await api.put(`/admin/users/${userId}/status`, { is_active: !currentActive })
      loadUsers()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al cambiar estado')
    }
  }

  const changeRole = async (userId, newRole) => {
    if (!confirm(`Cambiar rol a ${newRole}?`)) return
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole })
      loadUsers()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al cambiar rol')
    }
  }

  const filteredUsers = users.filter(u => {
    if (filter.role && u.role !== filter.role) return false
    if (filter.status === 'active' && !u.is_active) return false
    if (filter.status === 'inactive' && u.is_active) return false
    return true
  })

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Usuarios</h1>
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
        <select value={filter.role} onChange={e => setFilter({...filter, role: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Todos los roles</option>
          <option value="GUEST">GUEST</option>
          <option value="HOST">HOST</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Rol</th>
            <th>Nombre</th>
            <th>Ciudad</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map(user => (
            <tr key={user.id}>
              <td>{user.email}</td>
              <td>
                <select value={user.role} onChange={e => changeRole(user.id, e.target.value)} style={{padding: '0.25rem'}}>
                  <option value="GUEST">GUEST</option>
                  <option value="HOST">HOST</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              <td>{user.first_name} {user.last_name}</td>
              <td>{user.city || '-'}</td>
              <td>
                <span className={`status-badge status-${user.is_active ? 'active' : 'inactive'}`}>
                  {user.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td>
                <button onClick={() => toggleStatus(user.id, user.is_active)} className={`btn btn-sm ${user.is_active ? 'btn-danger' : 'btn-success'}`}>
                  {user.is_active ? 'Desactivar' : 'Activar'}
                </button>
              </td>
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
  const [extensions, setExtensions] = useState({})
  const [showExtensions, setShowExtensions] = useState(null)

  useEffect(() => {
    api.get('/admin/contracts').then(r => setContracts(r.data)).finally(() => setLoading(false))
  }, [])

  const downloadPdf = async (id) => {
    try {
      const response = await api.get(`/contracts/${id}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `contrato_${id}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      alert('Error al descargar PDF')
    }
  }

  const loadExtensions = async (contractId) => {
    if (showExtensions === contractId) {
      setShowExtensions(null)
      return
    }
    try {
      const r = await api.get(`/admin/contracts/${contractId}/extensions`)
      setExtensions({ ...extensions, [contractId]: r.data.extensions || [] })
      setShowExtensions(contractId)
    } catch (error) {
      alert('Error al cargar extensiones')
    }
  }

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
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map(c => (
            <>
              <tr key={c.id}>
                <td>{c.contract_number}</td>
                <td>{c.space_title}</td>
                <td>{c.guest_email}</td>
                <td>{c.host_email}</td>
                <td>Bs. {(c.total_amount || 0).toFixed(2)}</td>
                <td>Bs. {(c.commission_amount || 0).toFixed(2)}</td>
                <td>{c.status}</td>
                <td>
                  <button onClick={() => downloadPdf(c.id)} className="btn btn-sm btn-secondary" style={{marginRight: '0.25rem'}}>PDF</button>
                  <button onClick={() => loadExtensions(c.id)} className="btn btn-sm btn-secondary">
                    {showExtensions === c.id ? 'Ocultar' : 'Extensiones'}
                  </button>
                </td>
              </tr>
              {showExtensions === c.id && extensions[c.id] && (
                <tr key={`ext-${c.id}`}>
                  <td colSpan="8" style={{background: '#f5f5f5', padding: '1rem'}}>
                    <strong>Extensiones del contrato:</strong>
                    {extensions[c.id].length === 0 ? (
                      <p>Sin extensiones</p>
                    ) : (
                      <ul style={{marginTop: '0.5rem', paddingLeft: '1.5rem'}}>
                        {extensions[c.id].map(ext => (
                          <li key={ext.id}>
                            {ext.new_end_date} - Bs. {(ext.extension_amount || 0).toFixed(2)} - {ext.status}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </>
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

function AdminInvoices() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/invoices').then(r => setInvoices(r.data)).finally(() => setLoading(false))
  }, [])

  const downloadPdf = async (id) => {
    try {
      const response = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `factura_${id}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      alert('Error al descargar PDF')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Facturas</h1>
      <p className="disclaimer-box">[FACTURA NO FISCAL] Las facturas son documentos informativos. Para factura fiscal valida, se requiere integracion SIAT pendiente.</p>
      {invoices.length === 0 ? (
        <p>No hay facturas registradas</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Numero</th>
              <th>Tipo</th>
              <th>Contrato</th>
              <th>Monto</th>
              <th>Comision</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td>{inv.invoice_number}</td>
                <td>{inv.invoice_type}</td>
                <td>{inv.contract_number || '-'}</td>
                <td>Bs. {(inv.total_amount || 0).toFixed(2)}</td>
                <td>Bs. {(inv.commission_amount || 0).toFixed(2)}</td>
                <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                <td>
                  <button onClick={() => downloadPdf(inv.id)} className="btn btn-sm btn-secondary">PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function AdminLegalTexts() {
  const [texts, setTexts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [newText, setNewText] = useState({ type: '', title: '', content: '', version: '1.0' })
  const [showNew, setShowNew] = useState(false)

  const loadTexts = () => {
    api.get('/admin/legal-texts').then(r => setTexts(r.data.texts || [])).finally(() => setLoading(false))
  }

  useEffect(() => { loadTexts() }, [])

  const handleActivate = async (id) => {
    try {
      await api.put(`/admin/legal-texts/${id}/activate`)
      loadTexts()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al activar')
    }
  }

  const handleDeactivate = async (id) => {
    try {
      await api.put(`/admin/legal-texts/${id}/deactivate`)
      loadTexts()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al desactivar')
    }
  }

  const handleEdit = async (id) => {
    try {
      await api.put(`/admin/legal-texts/${id}`, { content: editContent })
      setEditingId(null)
      loadTexts()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar')
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/admin/legal-texts', newText)
      setShowNew(false)
      setNewText({ type: '', title: '', content: '', version: '1.0' })
      loadTexts()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al crear')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Textos Legales</h1>
      <button onClick={() => setShowNew(!showNew)} className="btn btn-primary" style={{marginBottom: '1rem'}}>
        {showNew ? 'Cancelar' : '+ Nueva Version'}
      </button>
      
      {showNew && (
        <div className="card" style={{marginBottom: '1rem', padding: '1rem'}}>
          <select value={newText.type} onChange={e => setNewText({...newText, type: e.target.value})} style={{marginBottom: '0.5rem', width: '100%', padding: '0.5rem'}}>
            <option value="">Seleccionar tipo...</option>
            <option value="aviso_legal">Aviso Legal</option>
            <option value="terminos_condiciones">Terminos y Condiciones</option>
            <option value="privacidad">Privacidad</option>
            <option value="pagos_reembolsos">Pagos y Reembolsos</option>
            <option value="intermediacion">Intermediacion</option>
            <option value="anti_bypass_guest">Anti-Bypass Guest</option>
            <option value="anti_bypass_host">Anti-Bypass Host</option>
            <option value="disclaimer_contrato">Disclaimer Contrato</option>
            <option value="disclaimer_firma">Disclaimer Firma</option>
            <option value="disclaimer_factura">Disclaimer Factura</option>
            <option value="liability_limitation">Limitacion de Responsabilidad</option>
            <option value="applicable_law">Ley Aplicable</option>
          </select>
          <input type="text" placeholder="Titulo" value={newText.title} onChange={e => setNewText({...newText, title: e.target.value})} style={{marginBottom: '0.5rem', width: '100%'}} />
          <input type="text" placeholder="Version (ej: 1.0, 2.0)" value={newText.version} onChange={e => setNewText({...newText, version: e.target.value})} style={{marginBottom: '0.5rem', width: '100%'}} />
          <textarea placeholder="Contenido" value={newText.content} onChange={e => setNewText({...newText, content: e.target.value})} rows={5} style={{marginBottom: '0.5rem', width: '100%'}} />
          <button onClick={handleCreate} className="btn btn-primary">Crear (Inactivo)</button>
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Titulo</th>
            <th>Estado</th>
            <th>Actualizado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {texts.map(t => (
            <tr key={t.id}>
              <td>{t.type}</td>
              <td>{t.title}</td>
              <td>
                <span className={`status-badge status-${t.is_active ? 'active' : 'inactive'}`}>
                  {t.is_active ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </td>
              <td>{new Date(t.updated_at).toLocaleDateString()}</td>
              <td>
                {t.is_active ? (
                  <button onClick={() => handleDeactivate(t.id)} className="btn btn-sm btn-danger">Desactivar</button>
                ) : (
                  <>
                    <button onClick={() => handleActivate(t.id)} className="btn btn-sm btn-success" style={{marginRight: '0.5rem'}}>Activar</button>
                    <button onClick={() => { setEditingId(t.id); setEditContent(t.content) }} className="btn btn-sm btn-secondary">Editar</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingId && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Editar Texto Legal</h3>
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={10} style={{width: '100%', marginBottom: '1rem'}} />
            <button onClick={() => handleEdit(editingId)} className="btn btn-primary" style={{marginRight: '0.5rem'}}>Guardar</button>
            <button onClick={() => setEditingId(null)} className="btn btn-secondary">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminNotificationTemplates() {
  const [templates, setTemplates] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('templates')

  useEffect(() => {
    Promise.all([
      api.get('/admin/notification-templates'),
      api.get('/admin/notification-log')
    ]).then(([tRes, lRes]) => {
      setTemplates(tRes.data.templates || [])
      setLogs(lRes.data.logs || [])
    }).finally(() => setLoading(false))
  }, [])

  const toggleActive = async (id, currentActive) => {
    try {
      await api.put(`/admin/notification-templates/${id}`, { is_active: !currentActive })
      const r = await api.get('/admin/notification-templates')
      setTemplates(r.data.templates || [])
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Plantillas de Notificacion</h1>
      <div style={{marginBottom: '1rem'}}>
        <button onClick={() => setView('templates')} className={`btn ${view === 'templates' ? 'btn-primary' : 'btn-secondary'}`} style={{marginRight: '0.5rem'}}>Plantillas</button>
        <button onClick={() => setView('logs')} className={`btn ${view === 'logs' ? 'btn-primary' : 'btn-secondary'}`}>Historial Envios</button>
      </div>

      {view === 'templates' ? (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Evento</th>
              <th>Canal</th>
              <th>Asunto</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id}>
                <td>{t.event_type}</td>
                <td>{t.channel}</td>
                <td>{t.subject}</td>
                <td>
                  <span className={`status-badge status-${t.is_active ? 'active' : 'inactive'}`}>
                    {t.is_active ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </td>
                <td>
                  <button onClick={() => toggleActive(t.id, t.is_active)} className={`btn btn-sm ${t.is_active ? 'btn-danger' : 'btn-success'}`}>
                    {t.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Evento</th>
              <th>Canal</th>
              <th>Destinatario</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString()}</td>
                <td>{l.event_type}</td>
                <td>{l.channel}</td>
                <td>{l.recipient}</td>
                <td>{l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function AdminAuditLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ from_date: '', to_date: '', user_id: '', event_type: '' })
  const [expanded, setExpanded] = useState(null)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.from_date) params.append('from_date', filters.from_date)
      if (filters.to_date) params.append('to_date', filters.to_date)
      if (filters.user_id) params.append('user_id', filters.user_id)
      if (filters.event_type) params.append('event_type', filters.event_type)
      const r = await api.get(`/admin/audit-log?${params.toString()}`)
      setLogs(r.data.logs || [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLogs() }, [])

  const formatJson = (data) => {
    if (!data) return '-'
    try {
      const obj = typeof data === 'string' ? JSON.parse(data) : data
      return JSON.stringify(obj, null, 2)
    } catch { return data }
  }

  return (
    <div>
      <h1>Auditoria</h1>
      <div className="filters-row" style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap'}}>
        <input type="date" placeholder="Desde" value={filters.from_date} onChange={e => setFilters({...filters, from_date: e.target.value})} />
        <input type="date" placeholder="Hasta" value={filters.to_date} onChange={e => setFilters({...filters, to_date: e.target.value})} />
        <input type="text" placeholder="User ID" value={filters.user_id} onChange={e => setFilters({...filters, user_id: e.target.value})} />
        <input type="text" placeholder="Evento (ej: USER_LOGIN)" value={filters.event_type} onChange={e => setFilters({...filters, event_type: e.target.value})} />
        <button onClick={loadLogs} className="btn btn-primary">Filtrar</button>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner"></div></div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Accion</th>
              <th>Entidad</th>
              <th>IP</th>
              <th>Detalles</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString()}</td>
                <td>{l.user_email || l.user_id || '-'}</td>
                <td><strong>{l.action}</strong></td>
                <td>{l.entity_type} / {l.entity_id || '-'}</td>
                <td>{l.ip_address}</td>
                <td>
                  <button onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="btn btn-sm btn-secondary">
                    {expanded === l.id ? 'Ocultar' : 'Ver'}
                  </button>
                  {expanded === l.id && (
                    <pre style={{fontSize: '0.75rem', maxWidth: '400px', overflow: 'auto', marginTop: '0.5rem'}}>
                      {l.new_data && <div><strong>new_data:</strong> {formatJson(l.new_data)}</div>}
                      {l.old_data && <div><strong>old_data:</strong> {formatJson(l.old_data)}</div>}
                    </pre>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function AdminAccounting() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dates, setDates] = useState({ from_date: '', to_date: '' })

  const loadSummary = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dates.from_date) params.append('from_date', dates.from_date)
      if (dates.to_date) params.append('to_date', dates.to_date)
      const r = await api.get(`/admin/accounting/summary?${params.toString()}`)
      setSummary(r.data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSummary() }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Contabilidad / Balanza</h1>
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
        <input type="date" value={dates.from_date} onChange={e => setDates({...dates, from_date: e.target.value})} />
        <input type="date" value={dates.to_date} onChange={e => setDates({...dates, to_date: e.target.value})} />
        <button onClick={loadSummary} className="btn btn-primary">Consultar</button>
      </div>

      <p style={{color: '#666', marginBottom: '1rem'}}>
        Periodo: {summary?.period?.from_date || 'Todos'} - {summary?.period?.to_date || 'Todos'}
      </p>

      <div className="stats-grid">
        {summary?.summary && Object.entries(summary.summary).map(([key, val]) => (
          <div key={key} className="stat-card card">
            <h3>{val.label || key}</h3>
            <p className="stat-number">Bs. {(val.total || 0).toFixed(2)}</p>
            {val.count !== undefined && <span>Cantidad: {val.count}</span>}
          </div>
        ))}
      </div>

      {summary?.totals && (
        <div className="card" style={{marginTop: '1.5rem', padding: '1rem'}}>
          <h3>Totales</h3>
          <table className="admin-table">
            <tbody>
              <tr><td>Ingresos Brutos</td><td>Bs. {(summary.totals.gross_income || 0).toFixed(2)}</td></tr>
              <tr><td>Neto (- reembolsos)</td><td>Bs. {(summary.totals.net_after_refunds || 0).toFixed(2)}</td></tr>
              <tr><td><strong>Ganancia Plataforma</strong></td><td><strong>Bs. {(summary.totals.platform_revenue || 0).toFixed(2)}</strong></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AdminExport() {
  const [exporting, setExporting] = useState(null)

  const exportTypes = [
    { key: 'users', label: 'Usuarios' },
    { key: 'spaces', label: 'Espacios' },
    { key: 'reservations', label: 'Reservaciones' },
    { key: 'contracts', label: 'Contratos' },
    { key: 'payments', label: 'Pagos' },
    { key: 'invoices', label: 'Facturas' },
    { key: 'audit', label: 'Auditoria' },
    { key: 'notification_log', label: 'Log Notificaciones' },
    { key: 'legal_texts', label: 'Textos Legales' }
  ]

  const handleExport = async (type) => {
    setExporting(type)
    try {
      const response = await api.get(`/admin/export/${type}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `export_${type}_${new Date().toISOString().split('T')[0]}.json`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      alert('Error al exportar')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <h1>Exportar Datos</h1>
      <p style={{marginBottom: '1rem', color: '#666'}}>Descarga datos del sistema en formato JSON. Cada exportacion queda registrada en auditoria.</p>
      <div className="export-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem'}}>
        {exportTypes.map(t => (
          <button key={t.key} onClick={() => handleExport(t.key)} disabled={exporting === t.key} className="btn btn-secondary" style={{padding: '1rem'}}>
            {exporting === t.key ? 'Exportando...' : `Exportar ${t.label}`}
          </button>
        ))}
      </div>
    </div>
  )
}

export default AdminDashboard
