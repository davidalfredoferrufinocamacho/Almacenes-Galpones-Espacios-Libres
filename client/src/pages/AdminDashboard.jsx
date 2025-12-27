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
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({})

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

  const toggleBlock = async (userId, currentBlocked) => {
    try {
      await api.put(`/admin/users/${userId}`, { is_blocked: !currentBlocked })
      loadUsers()
      alert(currentBlocked ? 'Usuario desbloqueado' : 'Usuario bloqueado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al bloquear usuario')
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

  const deleteUser = async (userId, email) => {
    if (!confirm(`¿Eliminar permanentemente al usuario ${email}? Esta accion no se puede deshacer.`)) return
    try {
      await api.delete(`/admin/users/${userId}`)
      loadUsers()
      alert('Usuario eliminado correctamente')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar usuario')
    }
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || '',
      city: user.city || ''
    })
  }

  const saveEdit = async () => {
    try {
      await api.put(`/admin/users/${editingUser.id}`, editForm)
      setEditingUser(null)
      loadUsers()
      alert('Usuario actualizado correctamente')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar usuario')
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
            <tr key={user.id} className={user.is_blocked ? 'user-blocked' : ''}>
              <td>
                {user.email}
                {user.is_blocked && <span className="blocked-badge">BLOQUEADO</span>}
              </td>
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
                <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                  <button onClick={() => openEditModal(user)} className="btn btn-sm btn-secondary" title="Editar">
                    Editar
                  </button>
                  <button onClick={() => toggleStatus(user.id, user.is_active)} className={`btn btn-sm ${user.is_active ? 'btn-warning' : 'btn-success'}`}>
                    {user.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => toggleBlock(user.id, user.is_blocked)} className={`btn btn-sm ${user.is_blocked ? 'btn-info' : 'btn-dark'}`}>
                    {user.is_blocked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                  {user.role !== 'ADMIN' && (
                    <button onClick={() => deleteUser(user.id, user.email)} className="btn btn-sm btn-danger" title="Eliminar">
                      Eliminar
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Editar Usuario</h3>
            <p style={{color: '#666', marginBottom: '1rem'}}>{editingUser.email}</p>
            <div style={{marginBottom: '1rem'}}>
              <label>Nombre:</label>
              <input type="text" value={editForm.first_name} onChange={e => setEditForm({...editForm, first_name: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Apellido:</label>
              <input type="text" value={editForm.last_name} onChange={e => setEditForm({...editForm, last_name: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Telefono:</label>
              <input type="text" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Ciudad:</label>
              <input type="text" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{display: 'flex', gap: '1rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingUser(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminSpaces() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', city: '', occupancy: '' })
  const [editingSpace, setEditingSpace] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  const loadSpaces = () => {
    api.get('/admin/spaces').then(r => setSpaces(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadSpaces() }, [])

  const changeStatus = async (spaceId, newStatus) => {
    if (!confirm(`¿Cambiar estado a ${newStatus}?`)) return
    try {
      await api.put(`/admin/spaces/${spaceId}/status`, { status: newStatus })
      loadSpaces()
      alert('Estado actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al cambiar estado')
    }
  }

  const deleteSpace = async (spaceId, title) => {
    if (!confirm(`¿Eliminar permanentemente "${title}"? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete(`/admin/spaces/${spaceId}`)
      loadSpaces()
      alert('Espacio eliminado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar espacio')
    }
  }

  const openEditModal = (space) => {
    setEditingSpace(space)
    setEditForm({
      title: space.title || '',
      description: space.description || '',
      address: space.address || '',
      city: space.city || '',
      department: space.department || '',
      total_sqm: space.total_sqm || 0,
      available_sqm: space.available_sqm || 0,
      price_per_sqm_day: space.price_per_sqm_day || '',
      price_per_sqm_week: space.price_per_sqm_week || '',
      price_per_sqm_month: space.price_per_sqm_month || ''
    })
  }

  const saveEdit = async () => {
    try {
      const dataToSend = {}
      if (editForm.title !== editingSpace.title) dataToSend.title = editForm.title
      if (editForm.description !== editingSpace.description) dataToSend.description = editForm.description
      if (editForm.address !== editingSpace.address) dataToSend.address = editForm.address
      if (editForm.city !== editingSpace.city) dataToSend.city = editForm.city
      if (editForm.department !== editingSpace.department) dataToSend.department = editForm.department
      if (editForm.total_sqm !== editingSpace.total_sqm) dataToSend.total_sqm = editForm.total_sqm
      if (editForm.available_sqm !== editingSpace.available_sqm) dataToSend.available_sqm = editForm.available_sqm
      if (editForm.price_per_sqm_day !== '' && editForm.price_per_sqm_day != editingSpace.price_per_sqm_day) dataToSend.price_per_sqm_day = parseFloat(editForm.price_per_sqm_day)
      if (editForm.price_per_sqm_week !== '' && editForm.price_per_sqm_week != editingSpace.price_per_sqm_week) dataToSend.price_per_sqm_week = parseFloat(editForm.price_per_sqm_week)
      if (editForm.price_per_sqm_month !== '' && editForm.price_per_sqm_month != editingSpace.price_per_sqm_month) dataToSend.price_per_sqm_month = parseFloat(editForm.price_per_sqm_month)
      
      if (Object.keys(dataToSend).length === 0) {
        alert('No hay cambios para guardar')
        return
      }
      
      await api.put(`/admin/spaces/${editingSpace.id}`, dataToSend)
      setEditingSpace(null)
      loadSpaces()
      alert('Espacio actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar espacio')
    }
  }

  const getOccupancyColor = (percent) => {
    if (percent >= 80) return '#dc3545'
    if (percent >= 50) return '#ffc107'
    return '#28a745'
  }

  const getStatusBadge = (status) => {
    const colors = { published: '#28a745', paused: '#ffc107', draft: '#6c757d', deleted: '#dc3545' }
    const labels = { published: 'Publicado', paused: 'Pausado', draft: 'Borrador', deleted: 'Eliminado' }
    return <span style={{background: colors[status] || '#6c757d', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem'}}>{labels[status] || status}</span>
  }

  const cities = [...new Set(spaces.map(s => s.city))].filter(Boolean)

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

  const filteredSpaces = spaces
    .filter(s => {
      if (filter.status && s.status !== filter.status) return false
      if (filter.city && s.city !== filter.city) return false
      if (filter.occupancy === 'free' && s.occupancy_percent > 0) return false
      if (filter.occupancy === 'partial' && (s.occupancy_percent === 0 || s.occupancy_percent >= 100)) return false
      if (filter.occupancy === 'full' && s.occupancy_percent < 100) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return s.title?.toLowerCase().includes(term) ||
               s.space_type?.toLowerCase().includes(term) ||
               s.city?.toLowerCase().includes(term) ||
               s.host_email?.toLowerCase().includes(term) ||
               s.address?.toLowerCase().includes(term)
      }
      return true
    })
    .sort((a, b) => {
      if (!sortConfig.key) return 0
      let aVal = a[sortConfig.key]
      let bVal = b[sortConfig.key]
      if (sortConfig.key === 'occupancy_percent') {
        aVal = a.occupancy_percent || 0
        bVal = b.occupancy_percent || 0
      }
      if (sortConfig.key === 'host') {
        aVal = a.host_email || ''
        bVal = b.host_email || ''
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Espacios</h1>
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
        <input 
          type="text" 
          placeholder="Buscar por titulo, tipo, ciudad, host..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          style={{padding: '0.5rem', minWidth: '250px', border: '1px solid #ddd', borderRadius: '4px'}}
        />
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          <option value="published">Publicado</option>
          <option value="paused">Pausado</option>
          <option value="draft">Borrador</option>
        </select>
        <select value={filter.city} onChange={e => setFilter({...filter, city: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Todas las ciudades</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filter.occupancy} onChange={e => setFilter({...filter, occupancy: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Toda ocupacion</option>
          <option value="free">100% Libre</option>
          <option value="partial">Parcialmente ocupado</option>
          <option value="full">100% Ocupado</option>
        </select>
        <span style={{marginLeft: 'auto', color: '#666', fontSize: '0.85rem'}}>
          {filteredSpaces.length} de {spaces.length} espacios
        </span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('title')} style={{cursor: 'pointer', userSelect: 'none'}}>Titulo{getSortIcon('title')}</th>
            <th onClick={() => handleSort('space_type')} style={{cursor: 'pointer', userSelect: 'none'}}>Tipo{getSortIcon('space_type')}</th>
            <th onClick={() => handleSort('city')} style={{cursor: 'pointer', userSelect: 'none'}}>Ciudad{getSortIcon('city')}</th>
            <th onClick={() => handleSort('occupancy_percent')} style={{cursor: 'pointer', userSelect: 'none'}}>Ocupacion{getSortIcon('occupancy_percent')}</th>
            <th onClick={() => handleSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Estado{getSortIcon('status')}</th>
            <th onClick={() => handleSort('host')} style={{cursor: 'pointer', userSelect: 'none'}}>Host{getSortIcon('host')}</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filteredSpaces.map(space => (
            <tr key={space.id} className={space.host_blocked ? 'user-blocked' : ''}>
              <td>
                {space.title}
                {space.next_contract_expiry && (
                  <div style={{fontSize: '0.7rem', color: '#856404', marginTop: '2px'}}>
                    Vence: {new Date(space.next_contract_expiry).toLocaleDateString()}
                  </div>
                )}
              </td>
              <td>{space.space_type}</td>
              <td>{space.city}</td>
              <td style={{minWidth: '150px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <div style={{flex: 1, height: '12px', background: '#e9ecef', borderRadius: '6px', overflow: 'hidden'}}>
                    <div style={{width: `${space.occupancy_percent}%`, height: '100%', background: getOccupancyColor(space.occupancy_percent), transition: 'width 0.3s'}}></div>
                  </div>
                  <span style={{fontSize: '0.75rem', whiteSpace: 'nowrap'}}>
                    {space.rented_sqm}/{space.total_sqm} m²
                  </span>
                </div>
                <div style={{fontSize: '0.7rem', color: '#666', marginTop: '2px'}}>
                  {space.occupancy_percent}% ocupado - {space.free_sqm} m² libres
                </div>
              </td>
              <td>{getStatusBadge(space.status)}</td>
              <td>
                {space.host_email}
                {space.host_blocked && <span className="blocked-badge">HOST BLOQ</span>}
              </td>
              <td>
                <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                  <button onClick={() => openEditModal(space)} className="btn btn-sm btn-secondary">Editar</button>
                  <select 
                    value={space.status} 
                    onChange={e => changeStatus(space.id, e.target.value)} 
                    style={{padding: '0.25rem', fontSize: '0.75rem'}}
                  >
                    <option value="draft">Borrador</option>
                    <option value="published">Publicar</option>
                    <option value="paused">Pausar</option>
                  </select>
                  <button onClick={() => deleteSpace(space.id, space.title)} className="btn btn-sm btn-danger">Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingSpace && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '600px'}}>
            <h3>Editar Espacio</h3>
            <p style={{color: '#666', marginBottom: '1rem'}}>ID: {editingSpace.id}</p>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
              <div style={{gridColumn: '1 / -1'}}>
                <label>Titulo:</label>
                <input type="text" value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div style={{gridColumn: '1 / -1'}}>
                <label>Descripcion:</label>
                <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '80px'}} />
              </div>
              <div style={{gridColumn: '1 / -1'}}>
                <label>Direccion:</label>
                <input type="text" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label>Ciudad:</label>
                <input type="text" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label>Departamento:</label>
                <input type="text" value={editForm.department} onChange={e => setEditForm({...editForm, department: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label>Total m²:</label>
                <input type="number" value={editForm.total_sqm} onChange={e => setEditForm({...editForm, total_sqm: parseFloat(e.target.value) || 0})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label>Disponible m²:</label>
                <input type="number" value={editForm.available_sqm} onChange={e => setEditForm({...editForm, available_sqm: parseFloat(e.target.value) || 0})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label>Precio/m²/dia (Bs.):</label>
                <input type="number" step="0.01" value={editForm.price_per_sqm_day} onChange={e => setEditForm({...editForm, price_per_sqm_day: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label>Precio/m²/semana (Bs.):</label>
                <input type="number" step="0.01" value={editForm.price_per_sqm_week} onChange={e => setEditForm({...editForm, price_per_sqm_week: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label>Precio/m²/mes (Bs.):</label>
                <input type="number" step="0.01" value={editForm.price_per_sqm_month} onChange={e => setEditForm({...editForm, price_per_sqm_month: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
            </div>
            {editingSpace.occupancy_percent > 0 && (
              <div style={{marginTop: '1rem', padding: '0.75rem', background: '#fff3cd', borderRadius: '4px', fontSize: '0.85rem'}}>
                Nota: No se pueden modificar precios ni m² totales mientras haya contratos activos.
              </div>
            )}
            <div style={{display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem'}}>
              <button onClick={() => setEditingSpace(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminReservations() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingReservation, setEditingReservation] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })

  const loadReservations = () => {
    api.get('/admin/reservations').then(r => setReservations(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadReservations() }, [])

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

  const openEditModal = (reservation) => {
    setEditingReservation(reservation)
    setEditForm({
      status: reservation.status,
      sqm_requested: reservation.sqm_requested,
      notes: reservation.notes || ''
    })
  }

  const saveEdit = async () => {
    try {
      const dataToSend = {}
      if (editForm.status !== editingReservation.status) dataToSend.status = editForm.status
      if (editForm.sqm_requested !== editingReservation.sqm_requested) dataToSend.sqm_requested = editForm.sqm_requested
      if (editForm.notes !== (editingReservation.notes || '')) dataToSend.notes = editForm.notes

      if (Object.keys(dataToSend).length === 0) {
        alert('No hay cambios para guardar')
        return
      }

      await api.put(`/admin/reservations/${editingReservation.id}`, dataToSend)
      setEditingReservation(null)
      loadReservations()
      alert('Reservacion actualizada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar reservacion')
    }
  }

  const deleteReservation = async (id, spaceTitle) => {
    if (!confirm(`¿Eliminar reservacion para "${spaceTitle}"? Esta accion no se puede deshacer.`)) return
    try {
      await api.delete(`/admin/reservations/${id}`)
      loadReservations()
      alert('Reservacion eliminada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar reservacion')
    }
  }

  const getStatusBadge = (status) => {
    const colors = { 
      pending: '#6c757d', confirmed: '#17a2b8', deposit_paid: '#ffc107', 
      contract_signed: '#28a745', completed: '#28a745', cancelled: '#dc3545', rejected: '#dc3545' 
    }
    const labels = { 
      pending: 'Pendiente', confirmed: 'Confirmada', deposit_paid: 'Anticipo Pagado',
      contract_signed: 'Contrato Firmado', completed: 'Completada', cancelled: 'Cancelada', rejected: 'Rechazada'
    }
    return <span style={{background: colors[status] || '#6c757d', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem'}}>{labels[status] || status}</span>
  }

  const filteredReservations = reservations
    .filter(r => {
      if (filterStatus && r.status !== filterStatus) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return r.space_title?.toLowerCase().includes(term) ||
               r.guest_email?.toLowerCase().includes(term) ||
               r.host_email?.toLowerCase().includes(term)
      }
      return true
    })
    .sort((a, b) => {
      if (!sortConfig.key) return 0
      let aVal = a[sortConfig.key]
      let bVal = b[sortConfig.key]
      if (sortConfig.key === 'space') aVal = a.space_title || ''
      if (sortConfig.key === 'space') bVal = b.space_title || ''
      if (sortConfig.key === 'guest') aVal = a.guest_email || ''
      if (sortConfig.key === 'guest') bVal = b.guest_email || ''
      if (sortConfig.key === 'host') aVal = a.host_email || ''
      if (sortConfig.key === 'host') bVal = b.host_email || ''
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Reservaciones</h1>
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
        <input 
          type="text" 
          placeholder="Buscar por espacio, guest, host..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          style={{padding: '0.5rem', minWidth: '220px', border: '1px solid #ddd', borderRadius: '4px'}}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="confirmed">Confirmada</option>
          <option value="deposit_paid">Anticipo Pagado</option>
          <option value="contract_signed">Contrato Firmado</option>
          <option value="completed">Completada</option>
          <option value="cancelled">Cancelada</option>
          <option value="rejected">Rechazada</option>
        </select>
        <span style={{marginLeft: 'auto', color: '#666', fontSize: '0.85rem'}}>
          {filteredReservations.length} de {reservations.length} reservaciones
        </span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('space')} style={{cursor: 'pointer', userSelect: 'none'}}>Espacio{getSortIcon('space')}</th>
            <th onClick={() => handleSort('guest')} style={{cursor: 'pointer', userSelect: 'none'}}>Guest{getSortIcon('guest')}</th>
            <th onClick={() => handleSort('host')} style={{cursor: 'pointer', userSelect: 'none'}}>Host{getSortIcon('host')}</th>
            <th onClick={() => handleSort('sqm_requested')} style={{cursor: 'pointer', userSelect: 'none'}}>m²{getSortIcon('sqm_requested')}</th>
            <th onClick={() => handleSort('total_amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Total{getSortIcon('total_amount')}</th>
            <th onClick={() => handleSort('deposit_amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Anticipo{getSortIcon('deposit_amount')}</th>
            <th onClick={() => handleSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Estado{getSortIcon('status')}</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filteredReservations.map(r => (
            <tr key={r.id}>
              <td>{r.space_title}</td>
              <td>{r.guest_email}</td>
              <td>{r.host_email}</td>
              <td>{r.sqm_requested}</td>
              <td>Bs. {r.total_amount?.toFixed(2) || '0.00'}</td>
              <td>Bs. {r.deposit_amount?.toFixed(2) || '0.00'}</td>
              <td>{getStatusBadge(r.status)}</td>
              <td>
                <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                  <button onClick={() => openEditModal(r)} className="btn btn-sm btn-secondary">Editar</button>
                  <button onClick={() => deleteReservation(r.id, r.space_title)} className="btn btn-sm btn-danger">Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingReservation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Editar Reservacion</h3>
            <p style={{color: '#666', marginBottom: '1rem'}}>Espacio: {editingReservation.space_title}</p>
            <div style={{marginBottom: '1rem'}}>
              <label>Estado:</label>
              <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}}>
                <option value="pending">Pendiente</option>
                <option value="confirmed">Confirmada</option>
                <option value="deposit_paid">Anticipo Pagado</option>
                <option value="contract_signed">Contrato Firmado</option>
                <option value="completed">Completada</option>
                <option value="cancelled">Cancelada</option>
                <option value="rejected">Rechazada</option>
              </select>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>m² Solicitados:</label>
              <input 
                type="number" 
                value={editForm.sqm_requested} 
                onChange={e => setEditForm({...editForm, sqm_requested: parseFloat(e.target.value) || 0})} 
                style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}}
                disabled={editingReservation.status === 'deposit_paid' || editingReservation.status === 'contract_signed'}
              />
              {(editingReservation.status === 'deposit_paid' || editingReservation.status === 'contract_signed') && (
                <small style={{color: '#856404'}}>No se puede modificar despues del pago de anticipo</small>
              )}
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Notas:</label>
              <textarea 
                value={editForm.notes} 
                onChange={e => setEditForm({...editForm, notes: e.target.value})} 
                style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '80px'}}
              />
            </div>
            <div style={{display: 'flex', gap: '1rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingReservation(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminContracts() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [extensions, setExtensions] = useState({})
  const [showExtensions, setShowExtensions] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [editingContract, setEditingContract] = useState(null)
  const [editForm, setEditForm] = useState({})

  const loadContracts = () => {
    api.get('/admin/contracts').then(r => setContracts(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadContracts() }, [])

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }))
  }

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

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
    if (showExtensions === contractId) { setShowExtensions(null); return }
    try {
      const r = await api.get(`/admin/contracts/${contractId}/extensions`)
      setExtensions({ ...extensions, [contractId]: r.data.extensions || [] })
      setShowExtensions(contractId)
    } catch (error) {
      alert('Error al cargar extensiones')
    }
  }

  const openEditModal = (contract) => {
    setEditingContract(contract)
    setEditForm({ status: contract.status, notes: contract.notes || '' })
  }

  const saveEdit = async () => {
    try {
      const dataToSend = {}
      if (editForm.status !== editingContract.status) dataToSend.status = editForm.status
      if (editForm.notes !== (editingContract.notes || '')) dataToSend.notes = editForm.notes
      if (Object.keys(dataToSend).length === 0) { alert('No hay cambios'); return }
      await api.put(`/admin/contracts/${editingContract.id}`, dataToSend)
      setEditingContract(null)
      loadContracts()
      alert('Contrato actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar contrato')
    }
  }

  const deleteContract = async (id, number) => {
    if (!confirm(`¿Eliminar contrato ${number}?`)) return
    try {
      await api.delete(`/admin/contracts/${id}`)
      loadContracts()
      alert('Contrato eliminado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar contrato')
    }
  }

  const getStatusBadge = (status) => {
    const colors = { pending: '#6c757d', signed: '#17a2b8', active: '#28a745', completed: '#28a745', cancelled: '#dc3545', terminated: '#dc3545' }
    const labels = { pending: 'Pendiente', signed: 'Firmado', active: 'Activo', completed: 'Completado', cancelled: 'Cancelado', terminated: 'Terminado' }
    return <span style={{background: colors[status] || '#6c757d', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem'}}>{labels[status] || status}</span>
  }

  const sortKeyMap = { contract_number: 'contract_number', space_title: 'space_title', guest_email: 'guest_email', host_email: 'host_email', total_amount: 'total_amount', commission_amount: 'commission_amount', status: 'status' }

  const filteredContracts = contracts
    .filter(c => {
      if (filterStatus && c.status !== filterStatus) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return c.contract_number?.toLowerCase().includes(term) || c.space_title?.toLowerCase().includes(term) ||
               c.guest_email?.toLowerCase().includes(term) || c.host_email?.toLowerCase().includes(term)
      }
      return true
    })
    .sort((a, b) => {
      if (!sortConfig.key) return 0
      const key = sortKeyMap[sortConfig.key] || sortConfig.key
      let aVal = a[key], bVal = b[key]
      if (typeof aVal === 'string') aVal = aVal?.toLowerCase() || ''
      if (typeof bVal === 'string') bVal = bVal?.toLowerCase() || ''
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Contratos</h1>
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
        <input type="text" placeholder="Buscar por numero, espacio, guest, host..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{padding: '0.5rem', minWidth: '250px', border: '1px solid #ddd', borderRadius: '4px'}} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="signed">Firmado</option>
          <option value="active">Activo</option>
          <option value="completed">Completado</option>
          <option value="cancelled">Cancelado</option>
          <option value="terminated">Terminado</option>
        </select>
        <span style={{marginLeft: 'auto', color: '#666', fontSize: '0.85rem'}}>{filteredContracts.length} de {contracts.length} contratos</span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('contract_number')} style={{cursor: 'pointer', userSelect: 'none'}}>Numero{getSortIcon('contract_number')}</th>
            <th onClick={() => handleSort('space_title')} style={{cursor: 'pointer', userSelect: 'none'}}>Espacio{getSortIcon('space_title')}</th>
            <th onClick={() => handleSort('guest_email')} style={{cursor: 'pointer', userSelect: 'none'}}>Guest{getSortIcon('guest_email')}</th>
            <th onClick={() => handleSort('host_email')} style={{cursor: 'pointer', userSelect: 'none'}}>Host{getSortIcon('host_email')}</th>
            <th onClick={() => handleSort('total_amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Total{getSortIcon('total_amount')}</th>
            <th onClick={() => handleSort('commission_amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Comision{getSortIcon('commission_amount')}</th>
            <th onClick={() => handleSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Estado{getSortIcon('status')}</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filteredContracts.map(c => (
            <>
              <tr key={c.id}>
                <td>{c.contract_number}</td>
                <td>{c.space_title}</td>
                <td>{c.guest_email}</td>
                <td>{c.host_email}</td>
                <td>Bs. {(c.total_amount || 0).toFixed(2)}</td>
                <td>Bs. {(c.commission_amount || 0).toFixed(2)}</td>
                <td>{getStatusBadge(c.status)}</td>
                <td>
                  <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                    <button onClick={() => downloadPdf(c.id)} className="btn btn-sm btn-secondary">PDF</button>
                    <button onClick={() => openEditModal(c)} className="btn btn-sm btn-secondary">Editar</button>
                    <button onClick={() => loadExtensions(c.id)} className="btn btn-sm btn-secondary">{showExtensions === c.id ? 'Ocultar' : 'Ext'}</button>
                    <button onClick={() => deleteContract(c.id, c.contract_number)} className="btn btn-sm btn-danger">Eliminar</button>
                  </div>
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
      {editingContract && (
        <div className="modal-overlay" onClick={() => setEditingContract(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Editar Contrato {editingContract.contract_number}</h2>
            <div style={{marginBottom: '1rem'}}>
              <label>Estado:</label>
              <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}}>
                <option value="pending">Pendiente</option>
                <option value="signed">Firmado</option>
                <option value="active">Activo</option>
                <option value="completed">Completado</option>
                <option value="cancelled">Cancelado</option>
                <option value="terminated">Terminado</option>
              </select>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Notas:</label>
              <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '80px'}} />
            </div>
            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingContract(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminPayments() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [editingPayment, setEditingPayment] = useState(null)
  const [editForm, setEditForm] = useState({})

  const loadPayments = () => {
    api.get('/admin/payments').then(r => setPayments(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadPayments() }, [])

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }))
  }

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

  const openEditModal = (payment) => {
    setEditingPayment(payment)
    setEditForm({ status: payment.status, escrow_status: payment.escrow_status || '', notes: payment.notes || '' })
  }

  const saveEdit = async () => {
    try {
      const dataToSend = {}
      if (editForm.status !== editingPayment.status) dataToSend.status = editForm.status
      if (editForm.escrow_status !== (editingPayment.escrow_status || '')) dataToSend.escrow_status = editForm.escrow_status
      if (editForm.notes !== (editingPayment.notes || '')) dataToSend.notes = editForm.notes
      if (Object.keys(dataToSend).length === 0) { alert('No hay cambios'); return }
      await api.put(`/admin/payments/${editingPayment.id}`, dataToSend)
      setEditingPayment(null)
      loadPayments()
      alert('Pago actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar pago')
    }
  }

  const deletePayment = async (id) => {
    if (!confirm('¿Eliminar este pago?')) return
    try {
      await api.delete(`/admin/payments/${id}`)
      loadPayments()
      alert('Pago eliminado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar pago')
    }
  }

  const getStatusBadge = (status) => {
    const colors = { pending: '#ffc107', completed: '#28a745', failed: '#dc3545', refunded: '#17a2b8' }
    const labels = { pending: 'Pendiente', completed: 'Completado', failed: 'Fallido', refunded: 'Reembolsado' }
    return <span style={{background: colors[status] || '#6c757d', color: status === 'pending' ? '#000' : 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem'}}>{labels[status] || status}</span>
  }

  const filteredPayments = payments
    .filter(p => {
      if (filterStatus && p.status !== filterStatus) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return p.user_email?.toLowerCase().includes(term) || p.space_title?.toLowerCase().includes(term) || p.payment_type?.toLowerCase().includes(term)
      }
      return true
    })
    .sort((a, b) => {
      if (!sortConfig.key) return 0
      let aVal = a[sortConfig.key], bVal = b[sortConfig.key]
      if (typeof aVal === 'string') aVal = aVal?.toLowerCase() || ''
      if (typeof bVal === 'string') bVal = bVal?.toLowerCase() || ''
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Pagos</h1>
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
        <input type="text" placeholder="Buscar por usuario, espacio, tipo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{padding: '0.5rem', minWidth: '250px', border: '1px solid #ddd', borderRadius: '4px'}} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="completed">Completado</option>
          <option value="failed">Fallido</option>
          <option value="refunded">Reembolsado</option>
        </select>
        <span style={{marginLeft: 'auto', color: '#666', fontSize: '0.85rem'}}>{filteredPayments.length} de {payments.length} pagos</span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('user_email')} style={{cursor: 'pointer', userSelect: 'none'}}>Usuario{getSortIcon('user_email')}</th>
            <th onClick={() => handleSort('payment_type')} style={{cursor: 'pointer', userSelect: 'none'}}>Tipo{getSortIcon('payment_type')}</th>
            <th onClick={() => handleSort('amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Monto{getSortIcon('amount')}</th>
            <th onClick={() => handleSort('payment_method')} style={{cursor: 'pointer', userSelect: 'none'}}>Metodo{getSortIcon('payment_method')}</th>
            <th onClick={() => handleSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Estado{getSortIcon('status')}</th>
            <th onClick={() => handleSort('escrow_status')} style={{cursor: 'pointer', userSelect: 'none'}}>Escrow{getSortIcon('escrow_status')}</th>
            <th onClick={() => handleSort('created_at')} style={{cursor: 'pointer', userSelect: 'none'}}>Fecha{getSortIcon('created_at')}</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filteredPayments.map(p => (
            <tr key={p.id}>
              <td>{p.user_email}</td>
              <td>{p.payment_type}</td>
              <td>Bs. {(p.amount || 0).toFixed(2)}</td>
              <td>{p.payment_method}</td>
              <td>{getStatusBadge(p.status)}</td>
              <td>{p.escrow_status || '-'}</td>
              <td>{new Date(p.created_at).toLocaleDateString()}</td>
              <td>
                <div style={{display: 'flex', gap: '0.25rem'}}>
                  <button onClick={() => openEditModal(p)} className="btn btn-sm btn-secondary">Editar</button>
                  <button onClick={() => deletePayment(p.id)} className="btn btn-sm btn-danger">Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editingPayment && (
        <div className="modal-overlay" onClick={() => setEditingPayment(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Editar Pago</h2>
            <div style={{marginBottom: '1rem'}}>
              <label>Estado:</label>
              <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}}>
                <option value="pending">Pendiente</option>
                <option value="completed">Completado</option>
                <option value="failed">Fallido</option>
                <option value="refunded">Reembolsado</option>
              </select>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Escrow:</label>
              <select value={editForm.escrow_status} onChange={e => setEditForm({...editForm, escrow_status: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}}>
                <option value="">Sin escrow</option>
                <option value="held">Retenido</option>
                <option value="released">Liberado</option>
                <option value="refunded">Reembolsado</option>
              </select>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Notas:</label>
              <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '80px'}} />
            </div>
            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingPayment(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
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
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [editForm, setEditForm] = useState({})

  const loadInvoices = () => {
    api.get('/admin/invoices').then(r => setInvoices(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadInvoices() }, [])

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }))
  }

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return ' ↕'
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓'
  }

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

  const openEditModal = (invoice) => {
    setEditingInvoice(invoice)
    setEditForm({ status: invoice.status || 'issued', notes: invoice.notes || '' })
  }

  const saveEdit = async () => {
    try {
      const dataToSend = {}
      if (editForm.status !== (editingInvoice.status || 'issued')) dataToSend.status = editForm.status
      if (editForm.notes !== (editingInvoice.notes || '')) dataToSend.notes = editForm.notes
      if (Object.keys(dataToSend).length === 0) { alert('No hay cambios'); return }
      await api.put(`/admin/invoices/${editingInvoice.id}`, dataToSend)
      setEditingInvoice(null)
      loadInvoices()
      alert('Factura actualizada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar factura')
    }
  }

  const deleteInvoice = async (id, number) => {
    if (!confirm(`¿Eliminar factura ${number}?`)) return
    try {
      await api.delete(`/admin/invoices/${id}`)
      loadInvoices()
      alert('Factura eliminada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar factura')
    }
  }

  const getStatusBadge = (status) => {
    const colors = { draft: '#6c757d', issued: '#17a2b8', paid: '#28a745', cancelled: '#dc3545' }
    const labels = { draft: 'Borrador', issued: 'Emitida', paid: 'Pagada', cancelled: 'Cancelada' }
    return <span style={{background: colors[status] || '#6c757d', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem'}}>{labels[status] || status || 'Emitida'}</span>
  }

  const filteredInvoices = invoices
    .filter(inv => {
      if (filterStatus && inv.status !== filterStatus) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return inv.invoice_number?.toLowerCase().includes(term) || inv.contract_number?.toLowerCase().includes(term) ||
               inv.recipient_email?.toLowerCase().includes(term) || inv.invoice_type?.toLowerCase().includes(term)
      }
      return true
    })
    .sort((a, b) => {
      if (!sortConfig.key) return 0
      let aVal = a[sortConfig.key], bVal = b[sortConfig.key]
      if (typeof aVal === 'string') aVal = aVal?.toLowerCase() || ''
      if (typeof bVal === 'string') bVal = bVal?.toLowerCase() || ''
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Facturas</h1>
      <p className="disclaimer-box">[FACTURA NO FISCAL] Las facturas son documentos informativos. Para factura fiscal valida, se requiere integracion SIAT pendiente.</p>
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
        <input type="text" placeholder="Buscar por numero, contrato, tipo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{padding: '0.5rem', minWidth: '250px', border: '1px solid #ddd', borderRadius: '4px'}} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="issued">Emitida</option>
          <option value="paid">Pagada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <span style={{marginLeft: 'auto', color: '#666', fontSize: '0.85rem'}}>{filteredInvoices.length} de {invoices.length} facturas</span>
      </div>
      {filteredInvoices.length === 0 ? (
        <p>No hay facturas registradas</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('invoice_number')} style={{cursor: 'pointer', userSelect: 'none'}}>Numero{getSortIcon('invoice_number')}</th>
              <th onClick={() => handleSort('invoice_type')} style={{cursor: 'pointer', userSelect: 'none'}}>Tipo{getSortIcon('invoice_type')}</th>
              <th onClick={() => handleSort('contract_number')} style={{cursor: 'pointer', userSelect: 'none'}}>Contrato{getSortIcon('contract_number')}</th>
              <th onClick={() => handleSort('total_amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Monto{getSortIcon('total_amount')}</th>
              <th onClick={() => handleSort('commission_amount')} style={{cursor: 'pointer', userSelect: 'none'}}>Comision{getSortIcon('commission_amount')}</th>
              <th onClick={() => handleSort('status')} style={{cursor: 'pointer', userSelect: 'none'}}>Estado{getSortIcon('status')}</th>
              <th onClick={() => handleSort('created_at')} style={{cursor: 'pointer', userSelect: 'none'}}>Fecha{getSortIcon('created_at')}</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map(inv => (
              <tr key={inv.id}>
                <td>{inv.invoice_number}</td>
                <td>{inv.invoice_type}</td>
                <td>{inv.contract_number || '-'}</td>
                <td>Bs. {(inv.total_amount || 0).toFixed(2)}</td>
                <td>Bs. {(inv.commission_amount || 0).toFixed(2)}</td>
                <td>{getStatusBadge(inv.status)}</td>
                <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                <td>
                  <div style={{display: 'flex', gap: '0.25rem'}}>
                    <button onClick={() => downloadPdf(inv.id)} className="btn btn-sm btn-secondary">PDF</button>
                    <button onClick={() => openEditModal(inv)} className="btn btn-sm btn-secondary">Editar</button>
                    <button onClick={() => deleteInvoice(inv.id, inv.invoice_number)} className="btn btn-sm btn-danger">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editingInvoice && (
        <div className="modal-overlay" onClick={() => setEditingInvoice(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Editar Factura {editingInvoice.invoice_number}</h2>
            <div style={{marginBottom: '1rem'}}>
              <label>Estado:</label>
              <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}}>
                <option value="draft">Borrador</option>
                <option value="issued">Emitida</option>
                <option value="paid">Pagada</option>
                <option value="cancelled">Cancelada</option>
              </select>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Notas:</label>
              <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '80px'}} />
            </div>
            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingInvoice(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminLegalTexts() {
  const [texts, setTexts] = useState([])
  const [categories, setCategories] = useState([])
  const [footerConfig, setFooterConfig] = useState({ title: '', text: '' })
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('texts')
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [newText, setNewText] = useState({ type: '', title: '', content: '', version: '1.0', category: 'legal' })
  const [showNew, setShowNew] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [newCategory, setNewCategory] = useState({ key: '', label: '' })
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

  const loadData = async () => {
    try {
      const [textsRes, catsRes, configRes] = await Promise.all([
        api.get('/admin/legal-texts'),
        api.get('/admin/legal-categories'),
        api.get('/admin/config')
      ])
      setTexts(textsRes.data.texts || [])
      setCategories(catsRes.data || [])
      const footerTitle = configRes.data.find(c => c.key === 'footer_title')
      const footerText = configRes.data.find(c => c.key === 'footer_text')
      setFooterConfig({ title: footerTitle?.value || '', text: footerText?.value || '' })
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleActivate = async (id) => {
    try {
      await api.put(`/admin/legal-texts/${id}/activate`)
      loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al activar')
    }
  }

  const handleDeactivate = async (id) => {
    try {
      await api.put(`/admin/legal-texts/${id}/deactivate`)
      loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al desactivar')
    }
  }

  const handleEdit = async (id) => {
    try {
      await api.put(`/admin/legal-texts/${id}`, { content: editContent, title: editTitle })
      setEditingId(null)
      loadData()
      alert('Texto actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar')
    }
  }

  const handleDelete = async (id, title) => {
    if (!confirm(`¿Eliminar texto "${title}"?`)) return
    try {
      await api.delete(`/admin/legal-texts/${id}`)
      loadData()
      alert('Texto eliminado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
    }
  }

  const handleCreate = async () => {
    try {
      await api.post('/admin/legal-texts', newText)
      setShowNew(false)
      setNewText({ type: '', title: '', content: '', version: '1.0', category: 'legal' })
      loadData()
      alert('Texto creado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al crear')
    }
  }

  const handleCreateCategory = async () => {
    try {
      await api.post('/admin/legal-categories', newCategory)
      setShowNewCategory(false)
      setNewCategory({ key: '', label: '' })
      loadData()
      alert('Categoria creada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al crear categoria')
    }
  }

  const handleUpdateCategory = async (id, label) => {
    try {
      await api.put(`/admin/legal-categories/${id}`, { label })
      setEditingCategory(null)
      loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al actualizar')
    }
  }

  const handleDeleteCategory = async (id, label) => {
    if (!confirm(`¿Eliminar categoria "${label}"?`)) return
    try {
      await api.delete(`/admin/legal-categories/${id}`)
      loadData()
      alert('Categoria eliminada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
    }
  }

  const handleSaveFooter = async () => {
    try {
      await api.put('/admin/config/footer_title', { value: footerConfig.title })
      await api.put('/admin/config/footer_text', { value: footerConfig.text })
      alert('Footer actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al guardar')
    }
  }

  const filteredTexts = texts.filter(t => {
    if (filterCategory && t.category !== filterCategory) return false
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      return t.title?.toLowerCase().includes(term) || t.type?.toLowerCase().includes(term)
    }
    return true
  })

  const typeLabels = {
    aviso_legal: 'Aviso Legal', terminos_condiciones: 'Terminos y Condiciones', privacidad: 'Privacidad',
    pagos_reembolsos: 'Pagos y Reembolsos', intermediacion: 'Intermediacion', anti_bypass_guest: 'Anti-Bypass Guest',
    anti_bypass_host: 'Anti-Bypass Host', disclaimer_contrato: 'Disclaimer Contrato', disclaimer_firma: 'Disclaimer Firma',
    disclaimer_factura: 'Disclaimer Factura', liability_limitation: 'Limitacion Responsabilidad', applicable_law: 'Ley Aplicable'
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Textos Legales</h1>
      <div style={{marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
        <button onClick={() => setView('texts')} className={`btn ${view === 'texts' ? 'btn-primary' : 'btn-secondary'}`}>Textos</button>
        <button onClick={() => setView('categories')} className={`btn ${view === 'categories' ? 'btn-primary' : 'btn-secondary'}`}>Categorias</button>
        <button onClick={() => setView('footer')} className={`btn ${view === 'footer' ? 'btn-primary' : 'btn-secondary'}`}>Footer</button>
      </div>

      {view === 'texts' && (
        <>
          <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
            <button onClick={() => setShowNew(!showNew)} className="btn btn-primary">{showNew ? 'Cancelar' : '+ Nuevo Texto'}</button>
            <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{padding: '0.5rem', minWidth: '200px'}} />
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{padding: '0.5rem'}}>
              <option value="">Todas las categorias</option>
              {categories.map(c => <option key={c.id} value={c.key}>{c.label}</option>)}
            </select>
            <span style={{marginLeft: 'auto', color: '#666', fontSize: '0.85rem'}}>{filteredTexts.length} de {texts.length} textos</span>
          </div>

          {showNew && (
            <div className="card" style={{marginBottom: '1rem', padding: '1rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem'}}>
                <select value={newText.type} onChange={e => setNewText({...newText, type: e.target.value})} style={{padding: '0.5rem'}}>
                  <option value="">Seleccionar tipo...</option>
                  {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={newText.category} onChange={e => setNewText({...newText, category: e.target.value})} style={{padding: '0.5rem'}}>
                  {categories.map(c => <option key={c.id} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Titulo" value={newText.title} onChange={e => setNewText({...newText, title: e.target.value})} style={{marginTop: '0.5rem', width: '100%', padding: '0.5rem'}} />
              <input type="text" placeholder="Version (ej: 1.0, 2.0)" value={newText.version} onChange={e => setNewText({...newText, version: e.target.value})} style={{marginTop: '0.5rem', width: '100%', padding: '0.5rem'}} />
              <textarea placeholder="Contenido" value={newText.content} onChange={e => setNewText({...newText, content: e.target.value})} rows={5} style={{marginTop: '0.5rem', width: '100%', padding: '0.5rem'}} />
              <button onClick={handleCreate} className="btn btn-primary" style={{marginTop: '0.5rem'}}>Crear (Inactivo)</button>
            </div>
          )}

          <table className="admin-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Titulo</th>
                <th>Categoria</th>
                <th>Version</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredTexts.map(t => (
                <tr key={t.id}>
                  <td>{typeLabels[t.type] || t.type}</td>
                  <td>{t.title}</td>
                  <td>{categories.find(c => c.key === t.category)?.label || t.category || 'Legal'}</td>
                  <td>{t.version}</td>
                  <td><span className={`status-badge status-${t.is_active ? 'active' : 'inactive'}`}>{t.is_active ? 'ACTIVO' : 'INACTIVO'}</span></td>
                  <td>
                    <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                      {t.is_active ? (
                        <button onClick={() => handleDeactivate(t.id)} className="btn btn-sm btn-danger">Desactivar</button>
                      ) : (
                        <>
                          <button onClick={() => handleActivate(t.id)} className="btn btn-sm btn-success">Activar</button>
                          <button onClick={() => { setEditingId(t.id); setEditContent(t.content); setEditTitle(t.title) }} className="btn btn-sm btn-secondary">Editar</button>
                          <button onClick={() => handleDelete(t.id, t.title)} className="btn btn-sm btn-danger">Eliminar</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {view === 'categories' && (
        <>
          <button onClick={() => setShowNewCategory(!showNewCategory)} className="btn btn-primary" style={{marginBottom: '1rem'}}>{showNewCategory ? 'Cancelar' : '+ Nueva Categoria'}</button>
          {showNewCategory && (
            <div className="card" style={{marginBottom: '1rem', padding: '1rem'}}>
              <input type="text" placeholder="Clave (ej: contractual)" value={newCategory.key} onChange={e => setNewCategory({...newCategory, key: e.target.value.toLowerCase().replace(/[^a-z_]/g, '')})} style={{marginBottom: '0.5rem', width: '100%', padding: '0.5rem'}} />
              <input type="text" placeholder="Etiqueta (ej: Contractual)" value={newCategory.label} onChange={e => setNewCategory({...newCategory, label: e.target.value})} style={{marginBottom: '0.5rem', width: '100%', padding: '0.5rem'}} />
              <button onClick={handleCreateCategory} className="btn btn-primary">Crear Categoria</button>
            </div>
          )}
          <table className="admin-table">
            <thead>
              <tr>
                <th>Clave</th>
                <th>Etiqueta</th>
                <th>Sistema</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td>{c.key}</td>
                  <td>{editingCategory === c.id ? <input type="text" defaultValue={c.label} onBlur={e => handleUpdateCategory(c.id, e.target.value)} autoFocus style={{padding: '0.25rem'}} /> : c.label}</td>
                  <td>{c.is_system ? 'Si' : 'No'}</td>
                  <td>
                    <div style={{display: 'flex', gap: '0.25rem'}}>
                      <button onClick={() => setEditingCategory(c.id)} className="btn btn-sm btn-secondary">Editar</button>
                      {!c.is_system && <button onClick={() => handleDeleteCategory(c.id, c.label)} className="btn btn-sm btn-danger">Eliminar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {view === 'footer' && (
        <div className="card" style={{padding: '1.5rem'}}>
          <h2>Configuracion del Footer</h2>
          <div style={{marginBottom: '1rem'}}>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Titulo del Footer:</label>
            <input type="text" value={footerConfig.title} onChange={e => setFooterConfig({...footerConfig, title: e.target.value})} style={{width: '100%', padding: '0.5rem', fontSize: '1rem'}} />
          </div>
          <div style={{marginBottom: '1rem'}}>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Texto del Footer:</label>
            <textarea value={footerConfig.text} onChange={e => setFooterConfig({...footerConfig, text: e.target.value})} rows={3} style={{width: '100%', padding: '0.5rem', fontSize: '1rem'}} />
          </div>
          <button onClick={handleSaveFooter} className="btn btn-primary">Guardar Cambios</button>
          <div style={{marginTop: '1.5rem', padding: '1rem', background: '#f5f5f5', borderRadius: '4px'}}>
            <strong>Vista previa:</strong>
            <div style={{marginTop: '0.5rem', textAlign: 'center'}}>
              <h3 style={{margin: '0 0 0.25rem 0'}}>{footerConfig.title}</h3>
              <p style={{margin: 0, color: '#666'}}>{footerConfig.text}</p>
            </div>
          </div>
        </div>
      )}

      {editingId && (
        <div className="modal-overlay" onClick={() => setEditingId(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '700px'}}>
            <h3>Editar Texto Legal</h3>
            <div style={{marginBottom: '1rem'}}>
              <label>Titulo:</label>
              <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Contenido:</label>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={12} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingId(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={() => handleEdit(editingId)} className="btn btn-primary">Guardar</button>
            </div>
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
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [editForm, setEditForm] = useState({})

  const loadData = () => {
    Promise.all([
      api.get('/admin/notification-templates'),
      api.get('/admin/notification-log')
    ]).then(([tRes, lRes]) => {
      setTemplates(tRes.data.templates || [])
      setLogs(lRes.data.logs || [])
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  const toggleActive = async (id, currentActive) => {
    try {
      await api.put(`/admin/notification-templates/${id}`, { is_active: !currentActive })
      loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  const openEditModal = (template) => {
    setEditingTemplate(template)
    setEditForm({ subject: template.subject || '', body_template: template.body_template || '' })
  }

  const saveEdit = async () => {
    try {
      await api.put(`/admin/notification-templates/${editingTemplate.id}`, editForm)
      setEditingTemplate(null)
      loadData()
      alert('Plantilla actualizada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar')
    }
  }

  const deleteTemplate = async (id, eventType) => {
    if (!confirm(`¿Eliminar plantilla "${eventType}"?`)) return
    try {
      await api.delete(`/admin/notification-templates/${id}`)
      loadData()
      alert('Plantilla eliminada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
    }
  }

  const deleteLog = async (id) => {
    if (!confirm('¿Eliminar este registro de envio?')) return
    try {
      await api.delete(`/admin/notification-log/${id}`)
      loadData()
      alert('Registro eliminado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
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
                  <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                    <button onClick={() => toggleActive(t.id, t.is_active)} className={`btn btn-sm ${t.is_active ? 'btn-danger' : 'btn-success'}`}>
                      {t.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => openEditModal(t)} className="btn btn-sm btn-secondary">Editar</button>
                    {!t.is_active && <button onClick={() => deleteTemplate(t.id, t.event_type)} className="btn btn-sm btn-danger">Eliminar</button>}
                  </div>
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
              <th>Acciones</th>
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
                <td>
                  <button onClick={() => deleteLog(l.id)} className="btn btn-sm btn-danger">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingTemplate && (
        <div className="modal-overlay" onClick={() => setEditingTemplate(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px'}}>
            <h2>Editar Plantilla: {editingTemplate.event_type}</h2>
            <div style={{marginBottom: '1rem'}}>
              <label>Asunto:</label>
              <input type="text" value={editForm.subject} onChange={e => setEditForm({...editForm, subject: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Cuerpo del mensaje:</label>
              <textarea value={editForm.body_template} onChange={e => setEditForm({...editForm, body_template: e.target.value})} rows={8} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingTemplate(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
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
  const [view, setView] = useState('resumen')
  const [dashboard, setDashboard] = useState(null)
  const [entries, setEntries] = useState([])
  const [taxPeriods, setTaxPeriods] = useState([])
  const [shareholders, setShareholders] = useState([])
  const [dividends, setDividends] = useState([])
  const [capital, setCapital] = useState({ transactions: [], total_capital: 0 })
  const [loading, setLoading] = useState(true)
  const [editingEntry, setEditingEntry] = useState(null)
  const [editingShareholder, setEditingShareholder] = useState(null)
  const [newEntry, setNewEntry] = useState({ entry_date: '', description: '', entry_type: 'income', debit_account: '1111', credit_account: '4100', amount: '' })
  const [newShareholder, setNewShareholder] = useState({ name: '', document_type: 'ci', document_number: '', email: '', share_percentage: '', capital_contributed: '' })
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [showNewShareholder, setShowNewShareholder] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())

  const loadData = async () => {
    setLoading(true)
    try {
      const [dashRes, entriesRes, taxRes, shRes, divRes, capRes] = await Promise.all([
        api.get(`/admin/accounting/dashboard?year=${year}`),
        api.get('/admin/accounting/entries'),
        api.get(`/admin/accounting/tax-periods?year=${year}`),
        api.get('/admin/accounting/shareholders'),
        api.get('/admin/accounting/dividends'),
        api.get('/admin/accounting/capital')
      ])
      setDashboard(dashRes.data)
      setEntries(entriesRes.data.entries || [])
      setTaxPeriods(taxRes.data.periods || [])
      setShareholders(shRes.data.shareholders || [])
      setDividends(divRes.data.distributions || [])
      setCapital(capRes.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [year])

  const createEntry = async () => {
    try {
      await api.post('/admin/accounting/entries', newEntry)
      setShowNewEntry(false)
      setNewEntry({ entry_date: '', description: '', entry_type: 'income', debit_account: '1111', credit_account: '4100', amount: '' })
      loadData()
      alert('Asiento creado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al crear')
    }
  }

  const deleteEntry = async (id) => {
    if (!confirm('¿Eliminar este asiento?')) return
    try {
      await api.delete(`/admin/accounting/entries/${id}`)
      loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
    }
  }

  const createShareholder = async () => {
    try {
      await api.post('/admin/accounting/shareholders', newShareholder)
      setShowNewShareholder(false)
      setNewShareholder({ name: '', document_type: 'ci', document_number: '', email: '', share_percentage: '', capital_contributed: '' })
      loadData()
      alert('Socio registrado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al crear')
    }
  }

  const deleteShareholder = async (id) => {
    if (!confirm('¿Eliminar este socio?')) return
    try {
      await api.delete(`/admin/accounting/shareholders/${id}`)
      loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
    }
  }

  const deleteCapital = async (id) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    try {
      await api.delete(`/admin/accounting/capital/${id}`)
      loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
    }
  }

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const entryTypes = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', tax: 'Impuesto', dividend: 'Dividendo', capital: 'Capital', adjustment: 'Ajuste' }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Contabilidad Profesional</h1>
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
        <button onClick={() => setView('resumen')} className={`btn ${view === 'resumen' ? 'btn-primary' : 'btn-secondary'}`}>Resumen</button>
        <button onClick={() => setView('transacciones')} className={`btn ${view === 'transacciones' ? 'btn-primary' : 'btn-secondary'}`}>Transacciones</button>
        <button onClick={() => setView('iva')} className={`btn ${view === 'iva' ? 'btn-primary' : 'btn-secondary'}`}>IVA (13%)</button>
        <button onClick={() => setView('it')} className={`btn ${view === 'it' ? 'btn-primary' : 'btn-secondary'}`}>IT (3%)</button>
        <button onClick={() => setView('capital')} className={`btn ${view === 'capital' ? 'btn-primary' : 'btn-secondary'}`}>Capital/Dividendos</button>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={{marginLeft: 'auto', padding: '0.5rem'}}>
          {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {view === 'resumen' && dashboard && (
        <>
          <div className="stats-grid">
            <div className="stat-card card">
              <h3>Capital Total</h3>
              <p className="stat-number">Bs. {(dashboard.capital?.total || 0).toFixed(2)}</p>
              <span>{dashboard.capital?.shareholders_count || 0} socios activos</span>
            </div>
            <div className="stat-card card">
              <h3>Ingresos del Mes</h3>
              <p className="stat-number">Bs. {(dashboard.income?.current_month?.total || 0).toFixed(2)}</p>
              <span>{dashboard.income?.current_month?.count || 0} transacciones</span>
            </div>
            <div className="stat-card card">
              <h3>IVA por Pagar (Mes)</h3>
              <p className="stat-number" style={{color: '#dc3545'}}>Bs. {(dashboard.taxes?.current_month?.iva?.amount || 0).toFixed(2)}</p>
              <span>13% sobre Bs. {(dashboard.taxes?.current_month?.iva?.taxable_base || 0).toFixed(2)}</span>
            </div>
            <div className="stat-card card">
              <h3>IT por Pagar (Mes)</h3>
              <p className="stat-number" style={{color: '#fd7e14'}}>Bs. {(dashboard.taxes?.current_month?.it?.amount || 0).toFixed(2)}</p>
              <span>3% sobre Bs. {(dashboard.taxes?.current_month?.it?.transaction_base || 0).toFixed(2)}</span>
            </div>
            <div className="stat-card card">
              <h3>Dividendos Pagados</h3>
              <p className="stat-number">Bs. {(dashboard.dividends?.total_paid || 0).toFixed(2)}</p>
            </div>
          </div>

          <div className="card" style={{marginTop: '1.5rem', padding: '1rem'}}>
            <h3>Ingresos Mensuales {year}</h3>
            <table className="admin-table">
              <thead><tr><th>Mes</th><th>Ingresos</th><th>Transacciones</th><th>IVA</th><th>IT</th></tr></thead>
              <tbody>
                {dashboard.income?.monthly?.map(m => (
                  <tr key={m.month}>
                    <td>{monthNames[parseInt(m.month) - 1]}</td>
                    <td>Bs. {(m.total || 0).toFixed(2)}</td>
                    <td>{m.count}</td>
                    <td>Bs. {((m.total || 0) * 0.13).toFixed(2)}</td>
                    <td>Bs. {((m.total || 0) * 0.03).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{marginTop: '1rem', padding: '1rem'}}>
            <h3>Resumen Trimestral {year}</h3>
            <table className="admin-table">
              <thead><tr><th>Trimestre</th><th>Ingresos</th><th>IVA Total</th><th>IT Total</th></tr></thead>
              <tbody>
                {dashboard.income?.quarterly?.map(q => (
                  <tr key={q.quarter}>
                    <td>Q{q.quarter}</td>
                    <td>Bs. {(q.total || 0).toFixed(2)}</td>
                    <td>Bs. {((q.total || 0) * 0.13).toFixed(2)}</td>
                    <td>Bs. {((q.total || 0) * 0.03).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {dashboard.taxes?.annual && (
            <div className="card" style={{marginTop: '1rem', padding: '1rem', background: '#f8f9fa'}}>
              <h3>Resumen Anual {year}</h3>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem'}}>
                <div><strong>Ingresos Totales:</strong> Bs. {(dashboard.taxes.annual.total_income || 0).toFixed(2)}</div>
                <div><strong>IVA Anual:</strong> Bs. {(dashboard.taxes.annual.iva_total || 0).toFixed(2)}</div>
                <div><strong>IT Anual:</strong> Bs. {(dashboard.taxes.annual.it_total || 0).toFixed(2)}</div>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'transacciones' && (
        <>
          <button onClick={() => setShowNewEntry(!showNewEntry)} className="btn btn-primary" style={{marginBottom: '1rem'}}>{showNewEntry ? 'Cancelar' : '+ Nuevo Asiento'}</button>
          {showNewEntry && (
            <div className="card" style={{padding: '1rem', marginBottom: '1rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem'}}>
                <input type="date" value={newEntry.entry_date} onChange={e => setNewEntry({...newEntry, entry_date: e.target.value})} />
                <select value={newEntry.entry_type} onChange={e => setNewEntry({...newEntry, entry_type: e.target.value})}>
                  {Object.entries(entryTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="number" placeholder="Monto" value={newEntry.amount} onChange={e => setNewEntry({...newEntry, amount: e.target.value})} />
              </div>
              <input type="text" placeholder="Descripcion" value={newEntry.description} onChange={e => setNewEntry({...newEntry, description: e.target.value})} style={{width: '100%', marginTop: '0.5rem', padding: '0.5rem'}} />
              <button onClick={createEntry} className="btn btn-primary" style={{marginTop: '0.5rem'}}>Crear Asiento</button>
            </div>
          )}
          <table className="admin-table">
            <thead><tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Descripcion</th><th>Monto</th><th>IVA</th><th>IT</th><th>Acciones</th></tr></thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td>{e.entry_number}</td>
                  <td>{e.entry_date}</td>
                  <td>{entryTypes[e.entry_type] || e.entry_type}</td>
                  <td>{e.description}</td>
                  <td>Bs. {(e.amount || 0).toFixed(2)}</td>
                  <td>Bs. {(e.iva_amount || 0).toFixed(2)}</td>
                  <td>Bs. {(e.it_amount || 0).toFixed(2)}</td>
                  <td>
                    <div style={{display: 'flex', gap: '0.25rem'}}>
                      <button onClick={() => setEditingEntry(e)} className="btn btn-sm btn-secondary">Editar</button>
                      {!e.is_reconciled && <button onClick={() => deleteEntry(e.id)} className="btn btn-sm btn-danger">Eliminar</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {view === 'iva' && (
        <div className="card" style={{padding: '1.5rem'}}>
          <h2>IVA - Impuesto al Valor Agregado (13%)</h2>
          <p style={{color: '#666', marginBottom: '1rem'}}>Segun Ley 843, el IVA se paga mensualmente sobre el debito fiscal menos el credito fiscal.</p>
          <table className="admin-table">
            <thead><tr><th>Periodo</th><th>Base Imponible</th><th>IVA Debito (13%)</th><th>Credito Fiscal</th><th>IVA a Pagar</th></tr></thead>
            <tbody>
              {dashboard?.income?.monthly?.map(m => (
                <tr key={m.month}>
                  <td>{monthNames[parseInt(m.month) - 1]} {year}</td>
                  <td>Bs. {(m.total || 0).toFixed(2)}</td>
                  <td>Bs. {((m.total || 0) * 0.13).toFixed(2)}</td>
                  <td>Bs. 0.00</td>
                  <td style={{fontWeight: 'bold', color: '#dc3545'}}>Bs. {((m.total || 0) * 0.13).toFixed(2)}</td>
                </tr>
              ))}
              <tr style={{background: '#f8f9fa', fontWeight: 'bold'}}>
                <td>TOTAL ANUAL</td>
                <td>Bs. {(dashboard?.taxes?.annual?.total_income || 0).toFixed(2)}</td>
                <td>Bs. {(dashboard?.taxes?.annual?.iva_total || 0).toFixed(2)}</td>
                <td>Bs. 0.00</td>
                <td style={{color: '#dc3545'}}>Bs. {(dashboard?.taxes?.annual?.iva_total || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div style={{marginTop: '1rem', padding: '1rem', background: '#fff3cd', borderRadius: '4px'}}>
            <strong>Recordatorio:</strong> El IVA debe declararse hasta el dia 15 del mes siguiente al periodo fiscal.
          </div>
        </div>
      )}

      {view === 'it' && (
        <div className="card" style={{padding: '1.5rem'}}>
          <h2>IT - Impuesto a las Transacciones (3%)</h2>
          <p style={{color: '#666', marginBottom: '1rem'}}>Segun Ley 843, el IT grava el ejercicio habitual del comercio sobre el monto bruto de transacciones.</p>
          <table className="admin-table">
            <thead><tr><th>Periodo</th><th>Transacciones Brutas</th><th>IT (3%)</th><th>Estado</th></tr></thead>
            <tbody>
              {dashboard?.income?.monthly?.map(m => (
                <tr key={m.month}>
                  <td>{monthNames[parseInt(m.month) - 1]} {year}</td>
                  <td>Bs. {(m.total || 0).toFixed(2)}</td>
                  <td style={{fontWeight: 'bold', color: '#fd7e14'}}>Bs. {((m.total || 0) * 0.03).toFixed(2)}</td>
                  <td><span className="status-badge status-pending">Pendiente</span></td>
                </tr>
              ))}
              <tr style={{background: '#f8f9fa', fontWeight: 'bold'}}>
                <td>TOTAL ANUAL</td>
                <td>Bs. {(dashboard?.taxes?.annual?.total_income || 0).toFixed(2)}</td>
                <td style={{color: '#fd7e14'}}>Bs. {(dashboard?.taxes?.annual?.it_total || 0).toFixed(2)}</td>
                <td>-</td>
              </tr>
            </tbody>
          </table>
          <div style={{marginTop: '1rem', padding: '1rem', background: '#d1ecf1', borderRadius: '4px'}}>
            <strong>Nota:</strong> El IT puede compensarse con el IUE pagado en la gestion anterior (hasta el 50%).
          </div>
        </div>
      )}

      {view === 'capital' && (
        <>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
            <div className="card" style={{padding: '1.5rem'}}>
              <h2>Capital Social: Bs. {(capital.total_capital || 0).toFixed(2)}</h2>
            </div>
            <div className="card" style={{padding: '1.5rem'}}>
              <h2>Socios Activos: {shareholders.filter(s => s.status === 'active').length}</h2>
            </div>
          </div>

          <h3>Socios/Accionistas</h3>
          <button onClick={() => setShowNewShareholder(!showNewShareholder)} className="btn btn-primary" style={{marginBottom: '1rem'}}>{showNewShareholder ? 'Cancelar' : '+ Nuevo Socio'}</button>
          {showNewShareholder && (
            <div className="card" style={{padding: '1rem', marginBottom: '1rem'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem'}}>
                <input type="text" placeholder="Nombre" value={newShareholder.name} onChange={e => setNewShareholder({...newShareholder, name: e.target.value})} />
                <input type="text" placeholder="CI/NIT" value={newShareholder.document_number} onChange={e => setNewShareholder({...newShareholder, document_number: e.target.value})} />
                <input type="email" placeholder="Email" value={newShareholder.email} onChange={e => setNewShareholder({...newShareholder, email: e.target.value})} />
                <input type="number" placeholder="% Participacion" value={newShareholder.share_percentage} onChange={e => setNewShareholder({...newShareholder, share_percentage: e.target.value})} />
                <input type="number" placeholder="Capital Aportado" value={newShareholder.capital_contributed} onChange={e => setNewShareholder({...newShareholder, capital_contributed: e.target.value})} />
              </div>
              <button onClick={createShareholder} className="btn btn-primary" style={{marginTop: '0.5rem'}}>Registrar Socio</button>
            </div>
          )}
          <table className="admin-table">
            <thead><tr><th>Nombre</th><th>Documento</th><th>Email</th><th>Participacion</th><th>Capital</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {shareholders.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.document_type?.toUpperCase()}: {s.document_number}</td>
                  <td>{s.email || '-'}</td>
                  <td>{s.share_percentage}%</td>
                  <td>Bs. {(s.capital_contributed || 0).toFixed(2)}</td>
                  <td><span className={`status-badge status-${s.status}`}>{s.status === 'active' ? 'Activo' : 'Inactivo'}</span></td>
                  <td>
                    <div style={{display: 'flex', gap: '0.25rem'}}>
                      <button onClick={() => setEditingShareholder(s)} className="btn btn-sm btn-secondary">Editar</button>
                      <button onClick={() => deleteShareholder(s.id)} className="btn btn-sm btn-danger">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{marginTop: '2rem'}}>Movimientos de Capital</h3>
          <table className="admin-table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Socio</th><th>Monto</th><th>Saldo</th><th>Acciones</th></tr></thead>
            <tbody>
              {capital.transactions?.map(t => (
                <tr key={t.id}>
                  <td>{t.transaction_date}</td>
                  <td>{t.transaction_type}</td>
                  <td>{t.shareholder_name || '-'}</td>
                  <td>Bs. {(t.amount || 0).toFixed(2)}</td>
                  <td>Bs. {(t.balance_after || 0).toFixed(2)}</td>
                  <td><button onClick={() => deleteCapital(t.id)} className="btn btn-sm btn-danger">Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{marginTop: '2rem'}}>Dividendos Distribuidos</h3>
          <table className="admin-table">
            <thead><tr><th>Año Fiscal</th><th>Utilidad Total</th><th>Reserva Legal</th><th>Distribuible</th><th>Distribuido</th><th>Estado</th></tr></thead>
            <tbody>
              {dividends.map(d => (
                <tr key={d.id}>
                  <td>{d.fiscal_year}</td>
                  <td>Bs. {(d.total_profit || 0).toFixed(2)}</td>
                  <td>Bs. {(d.legal_reserve || 0).toFixed(2)}</td>
                  <td>Bs. {(d.distributable_profit || 0).toFixed(2)}</td>
                  <td>Bs. {(d.total_distributed || 0).toFixed(2)}</td>
                  <td><span className={`status-badge status-${d.status}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {editingEntry && (
        <div className="modal-overlay" onClick={() => setEditingEntry(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Editar Asiento #{editingEntry.entry_number}</h2>
            <p>Funcion de edicion en desarrollo</p>
            <button onClick={() => setEditingEntry(null)} className="btn btn-secondary">Cerrar</button>
          </div>
        </div>
      )}

      {editingShareholder && (
        <div className="modal-overlay" onClick={() => setEditingShareholder(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Editar Socio: {editingShareholder.name}</h2>
            <p>Funcion de edicion en desarrollo</p>
            <button onClick={() => setEditingShareholder(null)} className="btn btn-secondary">Cerrar</button>
          </div>
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
