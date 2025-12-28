import { useState, useEffect } from 'react'
import api from '../services/api'
import './AdminDashboard.css'

function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [currentAdmin, setCurrentAdmin] = useState(null)

  useEffect(() => {
    loadStats()
    loadCurrentAdmin()
  }, [])

  const loadCurrentAdmin = async () => {
    try {
      const response = await api.get('/users/me')
      setCurrentAdmin(response.data)
    } catch (error) {
      console.error('Error loading current admin:', error)
    }
  }

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

  const isSuperAdmin = Boolean(currentAdmin?.is_super_admin)

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  // Secciones restringidas solo para Super Admin
  const superAdminOnlySections = ['admin-roles', 'config', 'legal-texts', 'audit-log', 'accounting', 'payment-methods']

  const allMenuItems = [
    { label: 'Dashboard', key: 'dashboard' },
    { label: 'Alertas', key: 'alerts' },
    { label: 'Auditoria', key: 'audit-log', superAdminOnly: true },
    { label: 'Backup y Recovery', key: 'backup', superAdminOnly: true },
    { label: 'Badges', key: 'badges' },
    { label: 'Campanas', key: 'campaigns' },
    { label: 'Clientes', key: 'clients' },
    { label: 'Configuracion', key: 'config', superAdminOnly: true },
    { label: 'Contabilidad', key: 'accounting', superAdminOnly: true },
    { label: 'Contratos', key: 'contracts' },
    { label: 'Depositos Seguridad', key: 'security-deposits' },
    { label: 'Disputas', key: 'disputes' },
    { label: 'Espacios', key: 'spaces' },
    { label: 'Estados de Cuenta', key: 'host-statements' },
    { label: 'Exportar', key: 'export' },
    { label: 'Facturas', key: 'invoices' },
    { label: 'FAQ', key: 'faq' },
    { label: 'Hosts', key: 'hosts' },
    { label: 'Mensajes', key: 'messages' },
    { label: 'Metodos de Pago', key: 'payment-methods', superAdminOnly: true },
    { label: 'Notificaciones', key: 'notifications' },
    { label: 'Pagos', key: 'payments' },
    { label: 'Reportes', key: 'reports' },
    { label: 'Reservaciones', key: 'reservations' },
    { label: 'Roles Admin', key: 'admin-roles', superAdminOnly: true },
    { label: 'Textos Legales', key: 'legal-texts', superAdminOnly: true },
    { label: 'Usuarios', key: 'users' },
    { label: 'Verificacion Hosts', key: 'host-verifications' },
  ]

  // Filtrar menú según rol
  const menuItems = isSuperAdmin 
    ? allMenuItems 
    : allMenuItems.filter(item => !item.superAdminOnly)

  const renderContent = () => {
    // Verificar acceso a secciones restringidas
    const restrictedSections = ['admin-roles', 'config', 'legal-texts', 'audit-log', 'accounting', 'payment-methods', 'backup']
    if (restrictedSections.includes(activeSection) && !isSuperAdmin) {
      return (
        <div style={{padding: '2rem', textAlign: 'center'}}>
          <h2 style={{color: '#dc3545'}}>Acceso Restringido</h2>
          <p>Esta seccion solo esta disponible para Super Administradores.</p>
          <button onClick={() => setActiveSection('dashboard')} className="btn btn-primary">
            Volver al Dashboard
          </button>
        </div>
      )
    }

    switch (activeSection) {
      case 'reports': return <AdminReports />
      case 'clients': return <AdminClients />
      case 'hosts': return <AdminHosts />
      case 'host-verifications': return <AdminHostVerifications />
      case 'users': return <AdminUsers isSuperAdmin={isSuperAdmin} />
      case 'admin-roles': return <AdminRoles />
      case 'spaces': return <AdminSpaces />
      case 'reservations': return <AdminReservations />
      case 'contracts': return <AdminContracts />
      case 'disputes': return <AdminDisputes />
      case 'payments': return <AdminPayments />
      case 'security-deposits': return <AdminSecurityDeposits />
      case 'invoices': return <AdminInvoices />
      case 'host-statements': return <AdminHostStatements />
      case 'payment-methods': return <AdminPaymentMethods />
      case 'campaigns': return <AdminCampaigns />
      case 'badges': return <AdminBadges />
      case 'faq': return <AdminFAQ />
      case 'alerts': return <AdminAlerts />
      case 'config': return <AdminConfig />
      case 'legal-texts': return <AdminLegalTexts />
      case 'notifications': return <AdminNotificationTemplates />
      case 'audit-log': return <AdminAuditLog />
      case 'accounting': return <AdminAccounting />
      case 'backup': return <AdminBackup />
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

function useUserPanel(role) {
  const [data, setData] = useState({ users: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [userDetails, setUserDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailTab, setDetailTab] = useState('resumen')
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editingItem, setEditingItem] = useState(null)
  const [itemForm, setItemForm] = useState({})

  const loadUsers = () => {
    setLoading(true)
    api.get(`/admin/panel/users?role=${role}`).then(r => setData(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadUsers() }, [])

  const loadUserDetails = async (userId) => {
    setDetailsLoading(true)
    try {
      const response = await api.get(`/admin/panel/users/${userId}/details`)
      setUserDetails(response.data)
      setSelectedUser(userId)
      setDetailTab('resumen')
    } catch (error) {
      alert('Error al cargar detalles')
    } finally {
      setDetailsLoading(false)
    }
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      company_name: user.company_name || '',
      phone: user.phone || '',
      street: user.street || '',
      street_number: user.street_number || '',
      city: user.city || '',
      country: user.country || 'Bolivia',
      department: user.department || '',
      classification: user.classification || '',
      anti_bypass_accepted: user.anti_bypass_accepted ? true : false,
      is_active: user.is_active,
      is_blocked: user.is_blocked,
      is_verified: user.is_verified
    })
  }

  const saveEdit = async () => {
    try {
      await api.put(`/admin/panel/users/${editingUser.id}`, editForm)
      setEditingUser(null)
      loadUsers()
      alert('Usuario actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al actualizar')
    }
  }

  const toggleUserStatus = async (userId, field, currentValue) => {
    try {
      await api.put(`/admin/panel/users/${userId}`, { [field]: !currentValue })
      loadUsers()
      if (userDetails && userDetails.user.id === userId) {
        loadUserDetails(userId)
      }
    } catch (error) {
      alert('Error al actualizar estado')
    }
  }

  const exportUserData = async (userId, userName) => {
    if (!userDetails) return
    const exportData = {
      usuario: userDetails.user,
      resumen: userDetails.summary,
      espacios: userDetails.spaces,
      reservaciones: userDetails.reservations,
      contratos: userDetails.contracts,
      pagos: userDetails.payments,
      facturas: userDetails.invoices,
      exportado_el: new Date().toISOString()
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usuario_${userName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const openItemEdit = (type, item) => {
    setEditingItem({ type, item })
    if (type === 'space') {
      setItemForm({ title: item.title, status: item.status, price_per_day: item.price_per_day || '', price_per_month: item.price_per_month || '' })
    } else if (type === 'reservation') {
      setItemForm({ status: item.status, notes: item.notes || '' })
    } else if (type === 'contract') {
      setItemForm({ status: item.status, notes: item.notes || '' })
    } else if (type === 'payment') {
      setItemForm({ status: item.status, escrow_status: item.escrow_status || '', notes: item.notes || '' })
    } else if (type === 'invoice') {
      setItemForm({ status: item.status, notes: item.notes || '' })
    }
  }

  const saveItemEdit = async () => {
    if (!editingItem) return
    const { type, item } = editingItem
    try {
      const endpoints = { space: 'spaces', reservation: 'reservations', contract: 'contracts', payment: 'payments', invoice: 'invoices' }
      await api.put(`/admin/${endpoints[type]}/${item.id}`, itemForm)
      setEditingItem(null)
      loadUserDetails(selectedUser)
      alert('Actualizado correctamente')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al actualizar')
    }
  }

  const deleteItem = async (type, id, name) => {
    if (!confirm(`¿Eliminar ${type} "${name}"? Esta accion puede ser irreversible.`)) return
    try {
      const endpoints = { space: 'spaces', reservation: 'reservations', contract: 'contracts', payment: 'payments', invoice: 'invoices' }
      await api.delete(`/admin/${endpoints[type]}/${id}`)
      loadUserDetails(selectedUser)
      alert('Eliminado correctamente')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar. Puede tener datos relacionados.')
    }
  }

  const filteredUsers = data.users.filter(u => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const matchName = (u.first_name || '').toLowerCase().includes(term) || 
                       (u.last_name || '').toLowerCase().includes(term) ||
                       (u.company_name || '').toLowerCase().includes(term)
      const matchEmail = u.email.toLowerCase().includes(term)
      if (!matchName && !matchEmail) return false
    }
    if (filterStatus === 'active' && (!u.is_active || u.is_blocked)) return false
    if (filterStatus === 'blocked' && !u.is_blocked) return false
    if (filterStatus === 'inactive' && u.is_active) return false
    if (filterStatus === 'verified' && !u.is_verified) return false
    if (filterStatus === 'with_contracts' && u.contracts_count === 0) return false
    if (filterStatus === 'with_reservations' && u.reservations_count === 0) return false
    if (filterStatus === 'with_spaces' && u.spaces_count === 0) return false
    return true
  })

  const formatMoney = (amount) => `Bs. ${(amount || 0).toLocaleString('es-BO', { minimumFractionDigits: 2 })}`

  const getStatusBadge = (user) => {
    if (user.is_blocked) return <span style={{background: '#dc3545', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.7rem'}}>Bloqueado</span>
    if (!user.is_active) return <span style={{background: '#6c757d', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.7rem'}}>Inactivo</span>
    if (user.is_verified) return <span style={{background: '#28a745', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.7rem'}}>Verificado</span>
    return <span style={{background: '#ffc107', color: 'black', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.7rem'}}>Activo</span>
  }

  return {
    data, loading, searchTerm, setSearchTerm, filterStatus, setFilterStatus,
    selectedUser, setSelectedUser, userDetails, detailsLoading, detailTab, setDetailTab,
    editingUser, setEditingUser, editForm, setEditForm, editingItem, setEditingItem, itemForm, setItemForm,
    loadUsers, loadUserDetails, openEditModal, saveEdit, toggleUserStatus, exportUserData,
    openItemEdit, saveItemEdit, deleteItem, filteredUsers, formatMoney, getStatusBadge
  }
}

function AdminClients() {
  const p = useUserPanel('GUEST')
  const { data, loading, searchTerm, setSearchTerm, filterStatus, setFilterStatus,
    selectedUser, setSelectedUser, userDetails, detailsLoading, detailTab, setDetailTab,
    editingUser, setEditingUser, editForm, setEditForm, editingItem, setEditingItem, itemForm, setItemForm,
    loadUserDetails, openEditModal, saveEdit, toggleUserStatus, exportUserData,
    openItemEdit, saveItemEdit, deleteItem, filteredUsers, formatMoney, getStatusBadge } = p

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Clientes (Arrendatarios)</h1>

      <div className="stats-grid" style={{marginBottom: '1.5rem'}}>
        <div className="stat-card card clickable" style={{padding: '1rem', borderLeft: '4px solid #17a2b8', cursor: 'pointer'}} onClick={() => setFilterStatus('')}>
          <h4 style={{margin: 0, fontSize: '0.9rem'}}>Total Clientes</h4>
          <p className="stat-number" style={{margin: '0.5rem 0', fontSize: '1.8rem'}}>{data.stats.total || 0}</p>
          <small style={{color: '#666'}}>Activos: {data.stats.active || 0}</small>
          <small className="card-link" style={{display: 'block', marginTop: '0.25rem'}}>Ver todos →</small>
        </div>
        <div className="stat-card card clickable" style={{padding: '1rem', borderLeft: '4px solid #28a745', cursor: 'pointer'}} onClick={() => setFilterStatus('with_reservations')}>
          <h4 style={{margin: 0, fontSize: '0.9rem'}}>Con Reservaciones</h4>
          <p className="stat-number" style={{margin: '0.5rem 0', fontSize: '1.8rem'}}>{data.users.filter(u => u.reservations_count > 0).length}</p>
          <small style={{color: '#666'}}>Clientes activos</small>
          <small className="card-link" style={{display: 'block', marginTop: '0.25rem'}}>Filtrar →</small>
        </div>
        <div className="stat-card card clickable" style={{padding: '1rem', borderLeft: '4px solid #6f42c1', cursor: 'pointer'}} onClick={() => setFilterStatus('with_contracts')}>
          <h4 style={{margin: 0, fontSize: '0.9rem'}}>Con Contratos</h4>
          <p className="stat-number" style={{margin: '0.5rem 0', fontSize: '1.8rem'}}>{data.stats.with_contracts || 0}</p>
          <small style={{color: '#666'}}>Verificados: {data.stats.verified || 0}</small>
          <small className="card-link" style={{display: 'block', marginTop: '0.25rem'}}>Filtrar →</small>
        </div>
        <div className="stat-card card clickable" style={{padding: '1rem', borderLeft: '4px solid #fd7e14', cursor: 'pointer'}} onClick={() => setFilterStatus('verified')}>
          <h4 style={{margin: 0, fontSize: '0.9rem'}}>Pagos Totales</h4>
          <p className="stat-number" style={{margin: '0.5rem 0', fontSize: '1.4rem'}}>{formatMoney(data.stats.total_revenue)}</p>
          <small style={{color: '#666'}}>Transacciones</small>
          <small className="card-link" style={{display: 'block', marginTop: '0.25rem'}}>Ver verificados →</small>
        </div>
      </div>

      <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
        <input 
          type="text" 
          placeholder="Buscar por nombre, empresa o email..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{padding: '0.5rem', flex: 1, minWidth: '200px'}}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="blocked">Bloqueados</option>
          <option value="verified">Verificados</option>
          <option value="with_contracts">Con contratos</option>
          <option value="with_reservations">Con reservaciones</option>
        </select>
      </div>

      <UserPanelContent 
        filteredUsers={filteredUsers} selectedUser={selectedUser} userDetails={userDetails}
        detailsLoading={detailsLoading} detailTab={detailTab} setDetailTab={setDetailTab}
        loadUserDetails={loadUserDetails} openEditModal={openEditModal} getStatusBadge={getStatusBadge}
        setSelectedUser={setSelectedUser} exportUserData={exportUserData} toggleUserStatus={toggleUserStatus}
        formatMoney={formatMoney} openItemEdit={openItemEdit} deleteItem={deleteItem} showSpaces={false}
      />

      <UserEditModal editingUser={editingUser} setEditingUser={setEditingUser} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} />
      <ItemEditModal editingItem={editingItem} setEditingItem={setEditingItem} itemForm={itemForm} setItemForm={setItemForm} saveItemEdit={saveItemEdit} formatMoney={formatMoney} />
    </div>
  )
}

function AdminHosts() {
  const p = useUserPanel('HOST')
  const { data, loading, searchTerm, setSearchTerm, filterStatus, setFilterStatus,
    selectedUser, setSelectedUser, userDetails, detailsLoading, detailTab, setDetailTab,
    editingUser, setEditingUser, editForm, setEditForm, editingItem, setEditingItem, itemForm, setItemForm,
    loadUserDetails, openEditModal, saveEdit, toggleUserStatus, exportUserData,
    openItemEdit, saveItemEdit, deleteItem, filteredUsers, formatMoney, getStatusBadge } = p

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Hosts (Anfitriones)</h1>

      <div className="stats-grid" style={{marginBottom: '1.5rem'}}>
        <div className="stat-card card clickable" style={{padding: '1rem', borderLeft: '4px solid #6f42c1', cursor: 'pointer'}} onClick={() => setFilterStatus('')}>
          <h4 style={{margin: 0, fontSize: '0.9rem'}}>Total Hosts</h4>
          <p className="stat-number" style={{margin: '0.5rem 0', fontSize: '1.8rem'}}>{data.stats.total || 0}</p>
          <small style={{color: '#666'}}>Activos: {data.stats.active || 0}</small>
          <small className="card-link" style={{display: 'block', marginTop: '0.25rem'}}>Ver todos →</small>
        </div>
        <div className="stat-card card clickable" style={{padding: '1rem', borderLeft: '4px solid #007bff', cursor: 'pointer'}} onClick={() => setFilterStatus('with_spaces')}>
          <h4 style={{margin: 0, fontSize: '0.9rem'}}>Con Espacios</h4>
          <p className="stat-number" style={{margin: '0.5rem 0', fontSize: '1.8rem'}}>{data.users.filter(u => u.spaces_count > 0).length}</p>
          <small style={{color: '#666'}}>Publicando</small>
          <small className="card-link" style={{display: 'block', marginTop: '0.25rem'}}>Filtrar →</small>
        </div>
        <div className="stat-card card clickable" style={{padding: '1rem', borderLeft: '4px solid #28a745', cursor: 'pointer'}} onClick={() => setFilterStatus('with_contracts')}>
          <h4 style={{margin: 0, fontSize: '0.9rem'}}>Con Contratos</h4>
          <p className="stat-number" style={{margin: '0.5rem 0', fontSize: '1.8rem'}}>{data.stats.with_contracts || 0}</p>
          <small style={{color: '#666'}}>Arrendando</small>
          <small className="card-link" style={{display: 'block', marginTop: '0.25rem'}}>Filtrar →</small>
        </div>
        <div className="stat-card card clickable" style={{padding: '1rem', borderLeft: '4px solid #fd7e14', cursor: 'pointer'}} onClick={() => setFilterStatus('verified')}>
          <h4 style={{margin: 0, fontSize: '0.9rem'}}>Comisiones</h4>
          <p className="stat-number" style={{margin: '0.5rem 0', fontSize: '1.4rem'}}>{formatMoney(data.stats.total_commissions)}</p>
          <small style={{color: '#666'}}>Generadas</small>
          <small className="card-link" style={{display: 'block', marginTop: '0.25rem'}}>Ver verificados →</small>
        </div>
      </div>

      <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
        <input 
          type="text" 
          placeholder="Buscar por nombre, empresa o email..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{padding: '0.5rem', flex: 1, minWidth: '200px'}}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="blocked">Bloqueados</option>
          <option value="verified">Verificados</option>
          <option value="with_contracts">Con contratos</option>
          <option value="with_spaces">Con espacios</option>
        </select>
      </div>

      <UserPanelContent 
        filteredUsers={filteredUsers} selectedUser={selectedUser} userDetails={userDetails}
        detailsLoading={detailsLoading} detailTab={detailTab} setDetailTab={setDetailTab}
        loadUserDetails={loadUserDetails} openEditModal={openEditModal} getStatusBadge={getStatusBadge}
        setSelectedUser={setSelectedUser} exportUserData={exportUserData} toggleUserStatus={toggleUserStatus}
        formatMoney={formatMoney} openItemEdit={openItemEdit} deleteItem={deleteItem} showSpaces={true}
      />

      <UserEditModal editingUser={editingUser} setEditingUser={setEditingUser} editForm={editForm} setEditForm={setEditForm} saveEdit={saveEdit} />
      <ItemEditModal editingItem={editingItem} setEditingItem={setEditingItem} itemForm={itemForm} setItemForm={setItemForm} saveItemEdit={saveItemEdit} formatMoney={formatMoney} />
    </div>
  )
}

function UserPanelContent({ filteredUsers, selectedUser, userDetails, detailsLoading, detailTab, setDetailTab,
  loadUserDetails, openEditModal, getStatusBadge, setSelectedUser, exportUserData, toggleUserStatus,
  formatMoney, openItemEdit, deleteItem, showSpaces }) {
  
  const detailTabs = showSpaces ? ['resumen', 'espacios', 'reservaciones', 'contratos', 'pagos', 'facturas'] : ['resumen', 'reservaciones', 'contratos', 'pagos', 'facturas']

  return (
    <div style={{display: 'grid', gridTemplateColumns: selectedUser ? '1fr 1.5fr' : '1fr', gap: '1rem'}}>
      <div>
        <table className="admin-table" style={{fontSize: '0.85rem'}}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Clasificacion</th>
              <th>Anti-Bypass</th>
              <th>Estado</th>
              <th>Actividad</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(u => (
              <tr key={u.id} style={{background: selectedUser === u.id ? '#e3f2fd' : 'inherit', cursor: 'pointer'}} onClick={() => loadUserDetails(u.id)}>
                <td>
                  <div style={{fontWeight: '500'}}>{u.first_name || u.company_name || 'Sin nombre'} {u.last_name || ''}</div>
                  <div style={{fontSize: '0.75rem', color: '#666'}}>{u.email}</div>
                  <div style={{fontSize: '0.7rem', color: '#999'}}>{u.street ? `${u.street} ${u.street_number || ''}, ` : ''}{u.city || 'Sin ciudad'}{u.country && u.country !== 'Bolivia' ? `, ${u.country}` : ''}</div>
                </td>
                <td>
                  {u.classification ? (
                    <span style={{
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '12px', 
                      fontSize: '0.7rem',
                      background: u.classification === 'premium' ? '#6f42c1' : u.classification === 'corporativo' ? '#0d6efd' : u.classification === 'frecuente' ? '#198754' : '#6c757d',
                      color: 'white'
                    }}>
                      {u.classification.charAt(0).toUpperCase() + u.classification.slice(1)}
                    </span>
                  ) : (
                    <span style={{fontSize: '0.7rem', color: '#999'}}>Sin clasificar</span>
                  )}
                </td>
                <td>
                  {u.anti_bypass_accepted ? (
                    <span style={{color: '#198754', fontSize: '0.75rem', fontWeight: '500'}}>Aceptada</span>
                  ) : (
                    <span style={{color: '#dc3545', fontSize: '0.75rem'}}>Pendiente</span>
                  )}
                </td>
                <td>{getStatusBadge(u)}</td>
                <td style={{fontSize: '0.75rem'}}>
                  {showSpaces && <div>Espacios: {u.spaces_count || 0}</div>}
                  <div>Reservas: {u.reservations_count || 0}</div>
                  <div>Contratos: {u.contracts_count || 0}</div>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEditModal(u)} className="btn btn-sm btn-secondary">Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && <p style={{textAlign: 'center', color: '#666', padding: '2rem'}}>No se encontraron usuarios</p>}
      </div>

      {selectedUser && userDetails && (
        <div className="card" style={{padding: '1rem', maxHeight: '80vh', overflowY: 'auto'}}>
          {detailsLoading ? (
            <div className="loading"><div className="spinner"></div></div>
          ) : (
            <>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem'}}>
                <div>
                  <h2 style={{margin: 0}}>{userDetails.user.first_name || userDetails.user.company_name || 'Usuario'} {userDetails.user.last_name || ''}</h2>
                  <p style={{margin: '0.25rem 0', color: '#666'}}>{userDetails.user.email}</p>
                  {userDetails.user.classification && (
                    <span style={{
                      padding: '0.2rem 0.5rem', 
                      borderRadius: '12px', 
                      fontSize: '0.75rem',
                      marginRight: '0.5rem',
                      background: userDetails.user.classification === 'premium' ? '#6f42c1' : userDetails.user.classification === 'corporativo' ? '#0d6efd' : userDetails.user.classification === 'frecuente' ? '#198754' : '#6c757d',
                      color: 'white'
                    }}>
                      {userDetails.user.classification.charAt(0).toUpperCase() + userDetails.user.classification.slice(1)}
                    </span>
                  )}
                  <div style={{display: 'flex', gap: '0.5rem', marginTop: '0.5rem'}}>{getStatusBadge(userDetails.user)}</div>
                  {(userDetails.user.street || userDetails.user.city) && (
                    <p style={{margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#555'}}>
                      {userDetails.user.street ? `${userDetails.user.street} ${userDetails.user.street_number || ''}, ` : ''}
                      {userDetails.user.city || ''}{userDetails.user.department ? `, ${userDetails.user.department}` : ''}
                      {userDetails.user.country && userDetails.user.country !== 'Bolivia' ? `, ${userDetails.user.country}` : ''}
                    </p>
                  )}
                  <div style={{marginTop: '0.5rem'}}>
                    {userDetails.user.anti_bypass_accepted ? (
                      <span style={{fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#d4edda', color: '#155724', borderRadius: '4px'}}>
                        Anti-Bypass: Aceptada {userDetails.user.anti_bypass_accepted_at ? `(${new Date(userDetails.user.anti_bypass_accepted_at).toLocaleDateString('es-BO')})` : ''}
                      </span>
                    ) : (
                      <span style={{fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: '#fff3cd', color: '#856404', borderRadius: '4px'}}>
                        Anti-Bypass: Pendiente
                      </span>
                    )}
                  </div>
                </div>
                <div style={{display: 'flex', gap: '0.5rem'}}>
                  <button onClick={() => exportUserData(userDetails.user.id, userDetails.user.email)} className="btn btn-sm btn-secondary">Exportar</button>
                  <button onClick={() => setSelectedUser(null)} className="btn btn-sm btn-secondary">Cerrar</button>
                </div>
              </div>

              <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap'}}>
                {detailTabs.map(tab => (
                  <button key={tab} onClick={() => setDetailTab(tab)} className={`btn btn-sm ${detailTab === tab ? 'btn-primary' : 'btn-secondary'}`}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {detailTab === 'resumen' && (
                <div className="stats-grid" style={{gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))'}}>
                  {showSpaces && (
                    <div className="card" style={{padding: '0.75rem', textAlign: 'center', cursor: 'pointer'}} onClick={() => setDetailTab('espacios')}>
                      <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#007bff'}}>{userDetails.summary.total_spaces}</div>
                      <div style={{fontSize: '0.75rem'}}>Espacios</div>
                    </div>
                  )}
                  <div className="card" style={{padding: '0.75rem', textAlign: 'center', cursor: 'pointer'}} onClick={() => setDetailTab('reservaciones')}>
                    <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#17a2b8'}}>{userDetails.summary.total_reservations}</div>
                    <div style={{fontSize: '0.75rem'}}>Reservaciones</div>
                  </div>
                  <div className="card" style={{padding: '0.75rem', textAlign: 'center', cursor: 'pointer'}} onClick={() => setDetailTab('contratos')}>
                    <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#28a745'}}>{userDetails.summary.total_contracts}</div>
                    <div style={{fontSize: '0.75rem'}}>Contratos</div>
                  </div>
                  <div className="card" style={{padding: '0.75rem', textAlign: 'center', cursor: 'pointer'}} onClick={() => setDetailTab('pagos')}>
                    <div style={{fontSize: '1.2rem', fontWeight: 'bold', color: '#6f42c1'}}>{formatMoney(userDetails.summary.total_payments)}</div>
                    <div style={{fontSize: '0.75rem'}}>Pagos</div>
                  </div>
                  <div className="card" style={{padding: '0.75rem', textAlign: 'center', cursor: 'pointer'}} onClick={() => setDetailTab('facturas')}>
                    <div style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#fd7e14'}}>{userDetails.summary.total_invoices}</div>
                    <div style={{fontSize: '0.75rem'}}>Facturas</div>
                  </div>
                </div>
              )}

              {detailTab === 'espacios' && showSpaces && (
                <div>
                  {userDetails.spaces.length === 0 ? <p style={{textAlign: 'center', color: '#666'}}>Sin espacios</p> : (
                    <table className="admin-table" style={{fontSize: '0.8rem'}}>
                      <thead><tr><th>Titulo</th><th>Tipo</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {userDetails.spaces.map(s => (
                          <tr key={s.id}>
                            <td style={{cursor: 'pointer', color: '#007bff'}} onClick={() => openItemEdit('space', s)}>{s.title}</td>
                            <td>{s.type}</td>
                            <td>{s.price_per_day ? `Bs. ${s.price_per_day}/dia` : `Bs. ${s.price_per_month}/mes`}</td>
                            <td><span style={{background: s.status === 'published' ? '#28a745' : '#6c757d', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.7rem'}}>{s.status}</span></td>
                            <td>
                              <button onClick={() => openItemEdit('space', s)} className="btn btn-sm btn-secondary" style={{marginRight: '0.25rem'}}>Editar</button>
                              <button onClick={() => deleteItem('space', s.id, s.title)} className="btn btn-sm btn-danger">Eliminar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {detailTab === 'reservaciones' && (
                <div>
                  {userDetails.reservations.length === 0 ? <p style={{textAlign: 'center', color: '#666'}}>Sin reservaciones</p> : (
                    <table className="admin-table" style={{fontSize: '0.8rem'}}>
                      <thead><tr><th>Espacio</th><th>Periodo</th><th>Monto</th><th>Estado</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {userDetails.reservations.map(r => (
                          <tr key={r.id}>
                            <td style={{cursor: 'pointer', color: '#007bff'}} onClick={() => openItemEdit('reservation', r)}>{r.space_title || 'N/A'}</td>
                            <td style={{fontSize: '0.75rem'}}>{new Date(r.start_date).toLocaleDateString('es-BO')} - {new Date(r.end_date).toLocaleDateString('es-BO')}</td>
                            <td>{formatMoney(r.total_price)}</td>
                            <td><span style={{background: r.status === 'confirmed' ? '#28a745' : r.status === 'pending' ? '#ffc107' : '#6c757d', color: r.status === 'pending' ? 'black' : 'white', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.7rem'}}>{r.status}</span></td>
                            <td>
                              <button onClick={() => openItemEdit('reservation', r)} className="btn btn-sm btn-secondary" style={{marginRight: '0.25rem'}}>Editar</button>
                              <button onClick={() => deleteItem('reservation', r.id, r.space_title)} className="btn btn-sm btn-danger">Eliminar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {detailTab === 'contratos' && (
                <div>
                  {userDetails.contracts.length === 0 ? <p style={{textAlign: 'center', color: '#666'}}>Sin contratos</p> : (
                    <table className="admin-table" style={{fontSize: '0.8rem'}}>
                      <thead><tr><th>Numero</th><th>Espacio</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {userDetails.contracts.map(c => (
                          <tr key={c.id}>
                            <td style={{cursor: 'pointer', color: '#007bff'}} onClick={() => openItemEdit('contract', c)}>{c.contract_number || c.id.slice(0,8)}</td>
                            <td>{c.space_title || 'N/A'}</td>
                            <td><span style={{background: c.status === 'signed' ? '#28a745' : c.status === 'pending' ? '#ffc107' : '#6c757d', color: c.status === 'pending' ? 'black' : 'white', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.7rem'}}>{c.status}</span></td>
                            <td style={{fontSize: '0.75rem'}}>{new Date(c.created_at).toLocaleDateString('es-BO')}</td>
                            <td>
                              <button onClick={() => openItemEdit('contract', c)} className="btn btn-sm btn-secondary" style={{marginRight: '0.25rem'}}>Editar</button>
                              <button onClick={() => deleteItem('contract', c.id, c.contract_number)} className="btn btn-sm btn-danger">Eliminar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {detailTab === 'pagos' && (
                <div>
                  {userDetails.payments.length === 0 ? <p style={{textAlign: 'center', color: '#666'}}>Sin pagos</p> : (
                    <table className="admin-table" style={{fontSize: '0.8rem'}}>
                      <thead><tr><th>Tipo</th><th>Monto</th><th>Estado</th><th>Escrow</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {userDetails.payments.map(pay => (
                          <tr key={pay.id}>
                            <td style={{cursor: 'pointer', color: '#007bff'}} onClick={() => openItemEdit('payment', pay)}>{pay.payment_type}</td>
                            <td style={{fontWeight: '500'}}>{formatMoney(pay.amount)}</td>
                            <td><span style={{background: pay.status === 'completed' ? '#28a745' : pay.status === 'pending' ? '#ffc107' : '#dc3545', color: pay.status === 'pending' ? 'black' : 'white', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.7rem'}}>{pay.status}</span></td>
                            <td>{pay.escrow_status || 'N/A'}</td>
                            <td>
                              <button onClick={() => openItemEdit('payment', pay)} className="btn btn-sm btn-secondary" style={{marginRight: '0.25rem'}}>Editar</button>
                              <button onClick={() => deleteItem('payment', pay.id, pay.payment_type)} className="btn btn-sm btn-danger">Eliminar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {detailTab === 'facturas' && (
                <div>
                  {userDetails.invoices.length === 0 ? <p style={{textAlign: 'center', color: '#666'}}>Sin facturas</p> : (
                    <table className="admin-table" style={{fontSize: '0.8rem'}}>
                      <thead><tr><th>Numero</th><th>Monto</th><th>IVA</th><th>Estado</th><th>Acciones</th></tr></thead>
                      <tbody>
                        {userDetails.invoices.map(inv => (
                          <tr key={inv.id}>
                            <td style={{cursor: 'pointer', color: '#007bff'}} onClick={() => openItemEdit('invoice', inv)}>{inv.invoice_number || inv.id.slice(0,8)}</td>
                            <td style={{fontWeight: '500'}}>{formatMoney(inv.total_amount)}</td>
                            <td>{formatMoney(inv.iva_amount)}</td>
                            <td><span style={{background: inv.status === 'paid' ? '#28a745' : inv.status === 'issued' ? '#17a2b8' : '#6c757d', color: 'white', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.7rem'}}>{inv.status}</span></td>
                            <td>
                              <button onClick={() => openItemEdit('invoice', inv)} className="btn btn-sm btn-secondary" style={{marginRight: '0.25rem'}}>Editar</button>
                              <button onClick={() => deleteItem('invoice', inv.id, inv.invoice_number)} className="btn btn-sm btn-danger">Eliminar</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div style={{marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #ddd'}}>
                <h4 style={{margin: '0 0 0.5rem 0'}}>Acciones Rapidas</h4>
                <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                  <button onClick={() => toggleUserStatus(userDetails.user.id, 'is_active', userDetails.user.is_active)} className={`btn btn-sm ${userDetails.user.is_active ? 'btn-warning' : 'btn-success'}`}>
                    {userDetails.user.is_active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => toggleUserStatus(userDetails.user.id, 'is_blocked', userDetails.user.is_blocked)} className={`btn btn-sm ${userDetails.user.is_blocked ? 'btn-success' : 'btn-danger'}`}>
                    {userDetails.user.is_blocked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                  <button onClick={() => toggleUserStatus(userDetails.user.id, 'is_verified', userDetails.user.is_verified)} className={`btn btn-sm ${userDetails.user.is_verified ? 'btn-secondary' : 'btn-primary'}`}>
                    {userDetails.user.is_verified ? 'Quitar Verificacion' : 'Verificar'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function UserEditModal({ editingUser, setEditingUser, editForm, setEditForm, saveEdit }) {
  if (!editingUser) return null
  return (
    <div className="modal-overlay" onClick={() => setEditingUser(null)}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto'}}>
        <h2>Editar Usuario</h2>
        <p style={{color: '#666', marginBottom: '1rem'}}>{editingUser.email}</p>
        
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Nombre:</label>
            <input type="text" value={editForm.first_name || ''} onChange={e => setEditForm({...editForm, first_name: e.target.value})} style={{width: '100%', padding: '0.5rem'}} />
          </div>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Apellido:</label>
            <input type="text" value={editForm.last_name || ''} onChange={e => setEditForm({...editForm, last_name: e.target.value})} style={{width: '100%', padding: '0.5rem'}} />
          </div>
        </div>
        
        <div style={{marginBottom: '1rem'}}>
          <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Empresa:</label>
          <input type="text" value={editForm.company_name || ''} onChange={e => setEditForm({...editForm, company_name: e.target.value})} style={{width: '100%', padding: '0.5rem'}} />
        </div>
        
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Telefono:</label>
            <input type="text" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} style={{width: '100%', padding: '0.5rem'}} />
          </div>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Clasificacion:</label>
            <select value={editForm.classification || ''} onChange={e => setEditForm({...editForm, classification: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
              <option value="">Sin clasificar</option>
              <option value="premium">Premium</option>
              <option value="standard">Standard</option>
              <option value="nuevo">Nuevo</option>
              <option value="frecuente">Frecuente</option>
              <option value="corporativo">Corporativo</option>
            </select>
          </div>
        </div>

        <h4 style={{marginBottom: '0.75rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem'}}>Direccion</h4>
        
        <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Calle:</label>
            <input type="text" value={editForm.street || ''} onChange={e => setEditForm({...editForm, street: e.target.value})} style={{width: '100%', padding: '0.5rem'}} placeholder="Ej: Av. 6 de Agosto" />
          </div>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Numero:</label>
            <input type="text" value={editForm.street_number || ''} onChange={e => setEditForm({...editForm, street_number: e.target.value})} style={{width: '100%', padding: '0.5rem'}} placeholder="Ej: 1234" />
          </div>
        </div>
        
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Ciudad:</label>
            <input type="text" value={editForm.city || ''} onChange={e => setEditForm({...editForm, city: e.target.value})} style={{width: '100%', padding: '0.5rem'}} />
          </div>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Departamento:</label>
            <select value={editForm.department || ''} onChange={e => setEditForm({...editForm, department: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
              <option value="">Seleccionar...</option>
              {['La Paz', 'Cochabamba', 'Santa Cruz', 'Oruro', 'Potosi', 'Tarija', 'Chuquisaca', 'Beni', 'Pando'].map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Pais:</label>
            <input type="text" value={editForm.country || 'Bolivia'} onChange={e => setEditForm({...editForm, country: e.target.value})} style={{width: '100%', padding: '0.5rem'}} />
          </div>
        </div>

        <h4 style={{marginBottom: '0.75rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem'}}>Estados y Permisos</h4>
        
        <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem'}}>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}><input type="checkbox" checked={editForm.is_active || false} onChange={e => setEditForm({...editForm, is_active: e.target.checked})} /> Activo</label>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}><input type="checkbox" checked={editForm.is_verified || false} onChange={e => setEditForm({...editForm, is_verified: e.target.checked})} /> Verificado</label>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc3545'}}><input type="checkbox" checked={editForm.is_blocked || false} onChange={e => setEditForm({...editForm, is_blocked: e.target.checked})} /> Bloqueado</label>
        </div>
        
        <div style={{marginBottom: '1rem', padding: '0.75rem', background: editForm.anti_bypass_accepted ? '#d4edda' : '#fff3cd', borderRadius: '4px'}}>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold'}}>
            <input type="checkbox" checked={editForm.anti_bypass_accepted || false} onChange={e => setEditForm({...editForm, anti_bypass_accepted: e.target.checked})} />
            Clausula Anti-Bypass Aceptada
          </label>
          <small style={{color: '#666', marginTop: '0.25rem', display: 'block'}}>
            {editingUser.anti_bypass_accepted_at 
              ? `Aceptada el: ${new Date(editingUser.anti_bypass_accepted_at).toLocaleDateString('es-BO')}`
              : 'El usuario no ha aceptado la clausula anti-bypass'}
          </small>
        </div>
        
        <div style={{display: 'flex', gap: '1rem', justifyContent: 'flex-end'}}>
          <button onClick={() => setEditingUser(null)} className="btn btn-secondary">Cancelar</button>
          <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
        </div>
      </div>
    </div>
  )
}

function ItemEditModal({ editingItem, setEditingItem, itemForm, setItemForm, saveItemEdit, formatMoney }) {
  if (!editingItem) return null
  return (
    <div className="modal-overlay" onClick={() => setEditingItem(null)}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
        <h2>Editar {editingItem.type === 'space' ? 'Espacio' : editingItem.type === 'reservation' ? 'Reservacion' : editingItem.type === 'contract' ? 'Contrato' : editingItem.type === 'payment' ? 'Pago' : 'Factura'}</h2>

        {editingItem.type === 'space' && (
          <>
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Titulo:</label>
              <input type="text" value={itemForm.title || ''} onChange={e => setItemForm({...itemForm, title: e.target.value})} style={{width: '100%', padding: '0.5rem'}} />
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
              <div><label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Precio/Dia:</label><input type="number" value={itemForm.price_per_day || ''} onChange={e => setItemForm({...itemForm, price_per_day: e.target.value})} style={{width: '100%', padding: '0.5rem'}} /></div>
              <div><label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Precio/Mes:</label><input type="number" value={itemForm.price_per_month || ''} onChange={e => setItemForm({...itemForm, price_per_month: e.target.value})} style={{width: '100%', padding: '0.5rem'}} /></div>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Estado:</label>
              <select value={itemForm.status || ''} onChange={e => setItemForm({...itemForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                <option value="draft">Borrador</option><option value="published">Publicado</option><option value="rented">Alquilado</option><option value="inactive">Inactivo</option>
              </select>
            </div>
          </>
        )}

        {editingItem.type === 'reservation' && (
          <>
            <div style={{marginBottom: '1rem', background: '#f8f9fa', padding: '0.75rem', borderRadius: '4px'}}>
              <p style={{margin: 0}}><strong>Espacio:</strong> {editingItem.item.space_title}</p>
              <p style={{margin: '0.25rem 0'}}><strong>Monto:</strong> {formatMoney(editingItem.item.total_price)}</p>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Estado:</label>
              <select value={itemForm.status || ''} onChange={e => setItemForm({...itemForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                <option value="pending">Pendiente</option><option value="confirmed">Confirmado</option><option value="deposit_paid">Deposito Pagado</option><option value="contract_signed">Contrato Firmado</option><option value="completed">Completado</option><option value="cancelled">Cancelado</option>
              </select>
            </div>
          </>
        )}

        {editingItem.type === 'contract' && (
          <>
            <div style={{marginBottom: '1rem', background: '#f8f9fa', padding: '0.75rem', borderRadius: '4px'}}>
              <p style={{margin: 0}}><strong>Numero:</strong> {editingItem.item.contract_number || editingItem.item.id?.slice(0,8)}</p>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Estado:</label>
              <select value={itemForm.status || ''} onChange={e => setItemForm({...itemForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                <option value="pending">Pendiente</option><option value="signed">Firmado</option><option value="active">Activo</option><option value="completed">Completado</option><option value="cancelled">Cancelado</option>
              </select>
            </div>
          </>
        )}

        {editingItem.type === 'payment' && (
          <>
            <div style={{marginBottom: '1rem', background: '#f8f9fa', padding: '0.75rem', borderRadius: '4px'}}>
              <p style={{margin: 0}}><strong>Tipo:</strong> {editingItem.item.payment_type}</p>
              <p style={{margin: '0.25rem 0'}}><strong>Monto:</strong> {formatMoney(editingItem.item.amount)}</p>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
              <div><label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Estado:</label>
                <select value={itemForm.status || ''} onChange={e => setItemForm({...itemForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                  <option value="pending">Pendiente</option><option value="completed">Completado</option><option value="failed">Fallido</option><option value="refunded">Reembolsado</option>
                </select>
              </div>
              <div><label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Escrow:</label>
                <select value={itemForm.escrow_status || ''} onChange={e => setItemForm({...itemForm, escrow_status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                  <option value="">Sin escrow</option><option value="held">Retenido</option><option value="released">Liberado</option><option value="refunded">Reembolsado</option>
                </select>
              </div>
            </div>
          </>
        )}

        {editingItem.type === 'invoice' && (
          <>
            <div style={{marginBottom: '1rem', background: '#f8f9fa', padding: '0.75rem', borderRadius: '4px'}}>
              <p style={{margin: 0}}><strong>Numero:</strong> {editingItem.item.invoice_number || editingItem.item.id?.slice(0,8)}</p>
              <p style={{margin: '0.25rem 0'}}><strong>Monto:</strong> {formatMoney(editingItem.item.total_amount)}</p>
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Estado:</label>
              <select value={itemForm.status || ''} onChange={e => setItemForm({...itemForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                <option value="draft">Borrador</option><option value="issued">Emitida</option><option value="paid">Pagada</option><option value="cancelled">Cancelada</option>
              </select>
            </div>
          </>
        )}

        <div style={{marginBottom: '1rem'}}>
          <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Notas:</label>
          <textarea value={itemForm.notes || ''} onChange={e => setItemForm({...itemForm, notes: e.target.value})} placeholder="Notas internas..." style={{width: '100%', padding: '0.5rem', minHeight: '60px'}} />
        </div>

        <div style={{display: 'flex', gap: '1rem', justifyContent: 'flex-end'}}>
          <button onClick={() => setEditingItem(null)} className="btn btn-secondary">Cancelar</button>
          <button onClick={saveItemEdit} className="btn btn-primary">Guardar</button>
        </div>
      </div>
    </div>
  )
}

function AdminUsers({ isSuperAdmin }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ role: '', status: '' })
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [passwordModal, setPasswordModal] = useState(null)
  const [passwordForm, setPasswordForm] = useState({ new_password: '', confirm_password: '' })
  const [passwordError, setPasswordError] = useState('')

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

  const toggleSuperAdmin = async (userId, currentStatus) => {
    const action = currentStatus ? 'degradar de Super Admin' : 'promover a Super Admin'
    if (!confirm(`¿Está seguro de que desea ${action} a este usuario?`)) return
    try {
      await api.put(`/admin/users/${userId}/super-admin`, { is_super_admin: !currentStatus })
      alert(currentStatus ? 'Usuario degradado de Super Admin' : 'Usuario promovido a Super Admin')
      loadUsers()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al cambiar estado de Super Admin')
    }
  }

  const removeAdminRole = async (userId, email) => {
    if (!confirm(`¿Quitar permisos de administrador a ${email}? El usuario pasará a ser HOST.`)) return
    try {
      await api.put(`/admin/users/${userId}/role`, { role: 'HOST' })
      loadUsers()
      alert('Permisos de administrador removidos')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al quitar permisos de admin')
    }
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || '',
      street: user.street || '',
      street_number: user.street_number || '',
      city: user.city || '',
      department: user.department || '',
      country: user.country || 'Bolivia',
      classification: user.classification || '',
      anti_bypass_accepted: user.anti_bypass_accepted ? true : false
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

  const openPasswordModal = (user) => {
    setPasswordModal(user)
    setPasswordForm({ new_password: '', confirm_password: '' })
    setPasswordError('')
  }

  const changePassword = async () => {
    setPasswordError('')
    if (passwordForm.new_password.length < 8) {
      setPasswordError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordError('Las contraseñas no coinciden')
      return
    }
    try {
      await api.put(`/admin/users/${passwordModal.id}/password`, passwordForm)
      setPasswordModal(null)
      alert('Contraseña actualizada correctamente')
    } catch (error) {
      setPasswordError(error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Error al cambiar contraseña')
    }
  }

  const filteredUsers = users.filter(u => {
    if (filter.role) {
      if (filter.role === 'SUPER_ADMIN') {
        if (u.role !== 'ADMIN' || !u.is_super_admin) return false
      } else if (filter.role === 'ADMIN') {
        if (u.role !== 'ADMIN' || u.is_super_admin) return false
      } else {
        if (u.role !== filter.role) return false
      }
    }
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
          <option value="GUEST">GUEST (Cliente)</option>
          <option value="HOST">HOST (Propietario)</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SUPER_ADMIN">SUPER ADMIN</option>
        </select>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>
      <table className="admin-table" style={{fontSize: '0.85rem'}}>
        <thead>
          <tr>
            <th>Email</th>
            <th>Rol</th>
            <th>Nombre</th>
            <th>Direccion</th>
            <th>Clasificacion</th>
            <th>Anti-Bypass</th>
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
                <div style={{display: 'flex', flexDirection: 'column', gap: '0.25rem'}}>
                  {user.role === 'ADMIN' ? (
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      fontWeight: 'bold',
                      background: user.is_super_admin ? '#dc3545' : '#fd7e14',
                      color: 'white',
                      textAlign: 'center'
                    }}>
                      {user.is_super_admin ? 'SUPER ADMIN' : 'ADMIN'}
                    </span>
                  ) : (
                    <>
                      <select value={user.role} onChange={e => changeRole(user.id, e.target.value)} style={{padding: '0.25rem', fontSize: '0.8rem'}}>
                        <option value="GUEST">GUEST</option>
                        <option value="HOST">HOST</option>
                      </select>
                      <span style={{
                        padding: '0.15rem 0.4rem',
                        borderRadius: '10px',
                        fontSize: '0.65rem',
                        background: user.role === 'HOST' ? '#198754' : '#0d6efd',
                        color: 'white',
                        textAlign: 'center'
                      }}>
                        {user.role === 'HOST' ? 'Propietario' : 'Cliente'}
                      </span>
                    </>
                  )}
                </div>
              </td>
              <td>{user.first_name} {user.last_name}</td>
              <td style={{fontSize: '0.75rem'}}>
                {user.street ? `${user.street} ${user.street_number || ''}, ` : ''}
                {user.city || '-'}
                {user.country && user.country !== 'Bolivia' ? `, ${user.country}` : ''}
              </td>
              <td>
                {user.classification ? (
                  <span style={{
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '12px', 
                    fontSize: '0.7rem',
                    background: user.classification === 'premium' ? '#6f42c1' : user.classification === 'corporativo' ? '#0d6efd' : user.classification === 'frecuente' ? '#198754' : '#6c757d',
                    color: 'white'
                  }}>
                    {user.classification.charAt(0).toUpperCase() + user.classification.slice(1)}
                  </span>
                ) : (
                  <span style={{fontSize: '0.7rem', color: '#999'}}>-</span>
                )}
              </td>
              <td>
                {user.anti_bypass_accepted ? (
                  <span style={{color: '#198754', fontSize: '0.75rem', fontWeight: '500'}}>Aceptada</span>
                ) : (
                  <span style={{color: '#dc3545', fontSize: '0.75rem'}}>Pendiente</span>
                )}
              </td>
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
                  <button onClick={() => openPasswordModal(user)} className="btn btn-sm btn-info" title="Cambiar Contraseña">
                    Clave
                  </button>
                  <button onClick={() => toggleStatus(user.id, user.is_active)} className={`btn btn-sm ${user.is_active ? 'btn-warning' : 'btn-success'}`}>
                    {user.is_active ? 'Desact.' : 'Activar'}
                  </button>
                  <button onClick={() => toggleBlock(user.id, user.is_blocked)} className={`btn btn-sm ${user.is_blocked ? 'btn-info' : 'btn-dark'}`}>
                    {user.is_blocked ? 'Desblq.' : 'Bloquear'}
                  </button>
                  {user.role === 'ADMIN' && isSuperAdmin && (
                    <>
                      <button 
                        onClick={() => toggleSuperAdmin(user.id, user.is_super_admin)} 
                        className={`btn btn-sm ${user.is_super_admin ? 'btn-warning' : 'btn-success'}`}
                        title={user.is_super_admin ? 'Degradar a Admin normal' : 'Promover a Super Admin'}
                      >
                        {user.is_super_admin ? 'Degradar' : 'Promover'}
                      </button>
                      <button 
                        onClick={() => removeAdminRole(user.id, user.email)} 
                        className="btn btn-sm btn-outline-danger"
                        title="Quitar permisos de administrador"
                        style={{border: '1px solid #dc3545', color: '#dc3545', background: 'white'}}
                      >
                        Quitar Admin
                      </button>
                    </>
                  )}
                  {(user.role !== 'ADMIN' || isSuperAdmin) && (
                    <button onClick={() => deleteUser(user.id, user.email)} className="btn btn-sm btn-danger" title="Eliminar">
                      Elim.
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingUser && (
        <div className="modal-overlay" onClick={() => setEditingUser(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto'}}>
            <h3>Editar Usuario</h3>
            <p style={{color: '#666', marginBottom: '1rem'}}>{editingUser.email} ({editingUser.role})</p>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
              <div>
                <label style={{fontWeight: 'bold'}}>Nombre:</label>
                <input type="text" value={editForm.first_name || ''} onChange={e => setEditForm({...editForm, first_name: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label style={{fontWeight: 'bold'}}>Apellido:</label>
                <input type="text" value={editForm.last_name || ''} onChange={e => setEditForm({...editForm, last_name: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
            </div>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
              <div>
                <label style={{fontWeight: 'bold'}}>Telefono:</label>
                <input type="text" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label style={{fontWeight: 'bold'}}>Clasificacion:</label>
                <select value={editForm.classification || ''} onChange={e => setEditForm({...editForm, classification: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}}>
                  <option value="">Sin clasificar</option>
                  <option value="premium">Premium</option>
                  <option value="standard">Standard</option>
                  <option value="nuevo">Nuevo</option>
                  <option value="frecuente">Frecuente</option>
                  <option value="corporativo">Corporativo</option>
                </select>
              </div>
            </div>

            <h4 style={{marginBottom: '0.75rem', borderBottom: '1px solid #ddd', paddingBottom: '0.5rem'}}>Direccion</h4>
            
            <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
              <div>
                <label style={{fontWeight: 'bold'}}>Calle:</label>
                <input type="text" value={editForm.street || ''} onChange={e => setEditForm({...editForm, street: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} placeholder="Ej: Av. 6 de Agosto" />
              </div>
              <div>
                <label style={{fontWeight: 'bold'}}>Numero:</label>
                <input type="text" value={editForm.street_number || ''} onChange={e => setEditForm({...editForm, street_number: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} placeholder="Ej: 1234" />
              </div>
            </div>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
              <div>
                <label style={{fontWeight: 'bold'}}>Ciudad:</label>
                <input type="text" value={editForm.city || ''} onChange={e => setEditForm({...editForm, city: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
              <div>
                <label style={{fontWeight: 'bold'}}>Departamento:</label>
                <select value={editForm.department || ''} onChange={e => setEditForm({...editForm, department: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}}>
                  <option value="">Seleccionar...</option>
                  {['La Paz', 'Cochabamba', 'Santa Cruz', 'Oruro', 'Potosi', 'Tarija', 'Chuquisaca', 'Beni', 'Pando'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontWeight: 'bold'}}>Pais:</label>
                <input type="text" value={editForm.country || 'Bolivia'} onChange={e => setEditForm({...editForm, country: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
              </div>
            </div>

            <div style={{marginBottom: '1rem', padding: '0.75rem', background: editForm.anti_bypass_accepted ? '#d4edda' : '#fff3cd', borderRadius: '4px'}}>
              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold'}}>
                <input type="checkbox" checked={editForm.anti_bypass_accepted || false} onChange={e => setEditForm({...editForm, anti_bypass_accepted: e.target.checked})} />
                Clausula Anti-Bypass Aceptada
              </label>
              <small style={{color: '#666', marginTop: '0.25rem', display: 'block'}}>
                {editingUser.anti_bypass_accepted_at 
                  ? `Aceptada el: ${new Date(editingUser.anti_bypass_accepted_at).toLocaleDateString('es-BO')}`
                  : 'El usuario no ha aceptado la clausula anti-bypass'}
              </small>
            </div>
            
            <div style={{display: 'flex', gap: '1rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingUser(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {passwordModal && (
        <div className="modal-overlay" onClick={() => setPasswordModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '400px'}}>
            <h3>Cambiar Contraseña</h3>
            <p style={{color: '#666', marginBottom: '1rem'}}>{passwordModal.email}</p>
            <p style={{fontSize: '0.85rem', color: '#888', marginBottom: '1rem'}}>Rol: <strong>{passwordModal.role}</strong></p>
            {passwordError && (
              <div style={{background: '#f8d7da', color: '#721c24', padding: '0.75rem', borderRadius: '4px', marginBottom: '1rem'}}>
                {passwordError}
              </div>
            )}
            <div style={{marginBottom: '1rem'}}>
              <label>Nueva Contraseña:</label>
              <input 
                type="password" 
                value={passwordForm.new_password} 
                onChange={e => setPasswordForm({...passwordForm, new_password: e.target.value})} 
                placeholder="Minimo 8 caracteres"
                style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} 
              />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Confirmar Contraseña:</label>
              <input 
                type="password" 
                value={passwordForm.confirm_password} 
                onChange={e => setPasswordForm({...passwordForm, confirm_password: e.target.value})} 
                placeholder="Repetir contraseña"
                style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} 
              />
            </div>
            <div style={{display: 'flex', gap: '1rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setPasswordModal(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={changePassword} className="btn btn-primary">Cambiar Contraseña</button>
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
      <table className="admin-table" style={{fontSize: '0.85rem'}}>
        <thead>
          <tr>
            <th onClick={() => handleSort('guest')} style={{cursor: 'pointer', userSelect: 'none'}}>Cliente{getSortIcon('guest')}</th>
            <th onClick={() => handleSort('host')} style={{cursor: 'pointer', userSelect: 'none'}}>Host{getSortIcon('host')}</th>
            <th onClick={() => handleSort('space')} style={{cursor: 'pointer', userSelect: 'none'}}>Espacio{getSortIcon('space')}</th>
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
              <td>
                <div style={{fontWeight: '500', color: '#3498db'}}>{r.guest_first_name || 'Sin nombre'}</div>
                <div style={{fontSize: '0.7rem', color: '#666'}}>{r.guest_email}</div>
              </td>
              <td>
                <div style={{fontWeight: '500', color: '#27ae60'}}>{r.host_first_name || 'Sin nombre'}</div>
                <div style={{fontSize: '0.7rem', color: '#666'}}>{r.host_email}</div>
              </td>
              <td>{r.space_title}</td>
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

function AdminPaymentMethods() {
  const [methods, setMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingMethod, setEditingMethod] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ code: '', name: '', description: '', instructions: '', icon: '', is_active: true })

  const loadMethods = () => {
    api.get('/admin/payment-methods').then(r => setMethods(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadMethods() }, [])

  const openEditModal = (method) => {
    setEditingMethod(method)
    setEditForm({
      code: method.code,
      name: method.name,
      description: method.description || '',
      instructions: method.instructions || '',
      icon: method.icon || '',
      is_active: method.is_active === 1,
      order_index: method.order_index
    })
  }

  const saveEdit = async () => {
    try {
      const dataToSend = {}
      if (editForm.code !== editingMethod.code) dataToSend.code = editForm.code
      if (editForm.name !== editingMethod.name) dataToSend.name = editForm.name
      if (editForm.description !== (editingMethod.description || '')) dataToSend.description = editForm.description
      if (editForm.instructions !== (editingMethod.instructions || '')) dataToSend.instructions = editForm.instructions
      if (editForm.icon !== (editingMethod.icon || '')) dataToSend.icon = editForm.icon
      if (editForm.is_active !== (editingMethod.is_active === 1)) dataToSend.is_active = editForm.is_active
      if (editForm.order_index !== editingMethod.order_index) dataToSend.order_index = editForm.order_index

      if (Object.keys(dataToSend).length === 0) {
        alert('No hay cambios para guardar')
        return
      }

      await api.put(`/admin/payment-methods/${editingMethod.id}`, dataToSend)
      setEditingMethod(null)
      loadMethods()
      alert('Metodo de pago actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al editar metodo de pago')
    }
  }

  const deleteMethod = async (id, name) => {
    if (!confirm(`¿Eliminar el metodo de pago "${name}"? Esta accion no se puede deshacer.`)) return
    try {
      await api.delete(`/admin/payment-methods/${id}`)
      loadMethods()
      alert('Metodo de pago eliminado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar metodo de pago')
    }
  }

  const toggleActive = async (method) => {
    try {
      await api.put(`/admin/payment-methods/${method.id}`, { is_active: method.is_active !== 1 })
      loadMethods()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al cambiar estado')
    }
  }

  const handleAdd = async () => {
    try {
      if (!addForm.code || !addForm.name) {
        alert('El codigo y nombre son requeridos')
        return
      }
      await api.post('/admin/payment-methods', addForm)
      setShowAddModal(false)
      setAddForm({ code: '', name: '', description: '', instructions: '', icon: '', is_active: true })
      loadMethods()
      alert('Metodo de pago creado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al crear metodo de pago')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
        <h1>Metodos de Pago</h1>
        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">+ Agregar Metodo</button>
      </div>
      <p style={{color: '#666', marginBottom: '1rem'}}>
        Configure los metodos de pago disponibles para clientes y hosts. Los metodos activos apareceran como opciones al realizar pagos.
      </p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Orden</th>
            <th>Codigo</th>
            <th>Nombre</th>
            <th>Descripcion</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {methods.map(m => (
            <tr key={m.id} style={{opacity: m.is_active ? 1 : 0.6}}>
              <td>{m.order_index}</td>
              <td><code style={{background: '#f0f0f0', padding: '0.2rem 0.4rem', borderRadius: '3px'}}>{m.code}</code></td>
              <td style={{fontWeight: '500'}}>{m.name}</td>
              <td style={{fontSize: '0.85rem', color: '#666', maxWidth: '300px'}}>{m.description || '-'}</td>
              <td>
                <span 
                  style={{
                    background: m.is_active ? '#28a745' : '#dc3545', 
                    color: 'white', 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '3px', 
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                  onClick={() => toggleActive(m)}
                  title="Clic para cambiar estado"
                >
                  {m.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td>
                <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                  <button onClick={() => openEditModal(m)} className="btn btn-sm btn-secondary">Editar</button>
                  <button onClick={() => deleteMethod(m.id, m.name)} className="btn btn-sm btn-danger">Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingMethod && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '500px'}}>
            <h3>Editar Metodo de Pago</h3>
            <div style={{marginBottom: '1rem'}}>
              <label>Codigo (identificador unico):</label>
              <input type="text" value={editForm.code} onChange={e => setEditForm({...editForm, code: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Nombre:</label>
              <input type="text" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Descripcion:</label>
              <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '60px'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Instrucciones de pago:</label>
              <textarea value={editForm.instructions} onChange={e => setEditForm({...editForm, instructions: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '60px'}} placeholder="Instrucciones que vera el usuario al seleccionar este metodo" />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Icono (nombre):</label>
              <input type="text" value={editForm.icon} onChange={e => setEditForm({...editForm, icon: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} placeholder="ej: credit-card, qr-code, bank" />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Orden de aparicion:</label>
              <input type="number" value={editForm.order_index} onChange={e => setEditForm({...editForm, order_index: parseInt(e.target.value) || 0})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({...editForm, is_active: e.target.checked})} />
                Metodo activo (visible para usuarios)
              </label>
            </div>
            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingMethod(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth: '500px'}}>
            <h3>Agregar Metodo de Pago</h3>
            <div style={{marginBottom: '1rem'}}>
              <label>Codigo (identificador unico):</label>
              <input type="text" value={addForm.code} onChange={e => setAddForm({...addForm, code: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} placeholder="ej: bank_transfer, tigo_money" />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Nombre:</label>
              <input type="text" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} placeholder="ej: Transferencia Bancaria" />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Descripcion:</label>
              <textarea value={addForm.description} onChange={e => setAddForm({...addForm, description: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '60px'}} placeholder="Breve descripcion del metodo de pago" />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Instrucciones de pago:</label>
              <textarea value={addForm.instructions} onChange={e => setAddForm({...addForm, instructions: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem', minHeight: '60px'}} placeholder="Instrucciones que vera el usuario al seleccionar este metodo" />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label>Icono (nombre):</label>
              <input type="text" value={addForm.icon} onChange={e => setAddForm({...addForm, icon: e.target.value})} style={{width: '100%', padding: '0.5rem', marginTop: '0.25rem'}} placeholder="ej: credit-card, qr-code, bank" />
            </div>
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                <input type="checkbox" checked={addForm.is_active} onChange={e => setAddForm({...addForm, is_active: e.target.checked})} />
                Metodo activo (visible para usuarios)
              </label>
            </div>
            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <button onClick={() => { setShowAddModal(false); setAddForm({ code: '', name: '', description: '', instructions: '', icon: '', is_active: true }) }} className="btn btn-secondary">Cancelar</button>
              <button onClick={handleAdd} className="btn btn-primary">Crear</button>
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
  const [editValues, setEditValues] = useState({})

  const siteContactKeys = ['footer_title', 'footer_text', 'contact_description', 'contact_notice', 'contact_hours', 'contact_response_time']
  const siteContactLabels = {
    footer_title: 'Titulo del Footer',
    footer_text: 'Descripcion del Footer',
    contact_description: 'Descripcion en Pagina de Contacto',
    contact_notice: 'Aviso de Canal de Contacto',
    contact_hours: 'Horario de Atencion',
    contact_response_time: 'Tiempo de Respuesta'
  }

  useEffect(() => {
    api.get('/admin/config').then(r => {
      setConfig(r.data)
      const values = {}
      r.data.forEach(c => { values[c.key] = c.value })
      setEditValues(values)
    }).finally(() => setLoading(false))
  }, [])

  const handleUpdate = async (key) => {
    const original = config.find(c => c.key === key)
    if (editValues[key] === original?.value) return
    try {
      await api.put(`/admin/config/${key}`, { value: editValues[key] })
      setConfig(prev => prev.map(c => c.key === key ? { ...c, value: editValues[key] } : c))
      alert('Configuracion actualizada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  const siteConfigs = config.filter(c => siteContactKeys.includes(c.key))
  const systemConfigs = config.filter(c => !siteContactKeys.includes(c.key))

  return (
    <div>
      <h1>Configuracion del Sistema</h1>
      
      <div className="card" style={{marginBottom: '2rem'}}>
        <h2 style={{marginBottom: '1rem', color: 'var(--primary)'}}>Informacion del Sitio y Contacto</h2>
        <p style={{color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem'}}>
          Esta informacion se muestra en el footer y en la pagina de contacto. Los cambios son visibles inmediatamente.
        </p>
        <div className="config-list">
          {siteContactKeys.map(key => {
            const c = siteConfigs.find(cfg => cfg.key === key)
            if (!c) return null
            const isLongText = ['contact_description', 'contact_notice'].includes(key)
            return (
              <div key={c.id} className="config-item" style={{flexDirection: 'column', alignItems: 'stretch'}}>
                <div style={{marginBottom: '0.5rem'}}>
                  <strong>{siteContactLabels[key] || c.key}</strong>
                  <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem'}}>({c.key})</span>
                </div>
                <div className="config-value" style={{flex: 1}}>
                  {isLongText ? (
                    <textarea 
                      value={editValues[key] || ''} 
                      onChange={(e) => setEditValues(prev => ({...prev, [key]: e.target.value}))}
                      onBlur={() => handleUpdate(key)}
                      style={{width: '100%', minHeight: '80px', padding: '0.5rem'}}
                    />
                  ) : (
                    <input 
                      type="text" 
                      value={editValues[key] || ''} 
                      onChange={(e) => setEditValues(prev => ({...prev, [key]: e.target.value}))}
                      onBlur={() => handleUpdate(key)}
                      style={{width: '100%'}}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card">
        <h2 style={{marginBottom: '1rem', color: 'var(--primary)'}}>Parametros del Sistema</h2>
        <div className="config-list">
          {systemConfigs.map(c => (
            <div key={c.id} className="config-item">
              <div>
                <strong>{c.key}</strong>
                <p>{c.description}</p>
              </div>
              <div className="config-value">
                <input 
                  type="text" 
                  value={editValues[c.key] || ''} 
                  onChange={(e) => setEditValues(prev => ({...prev, [c.key]: e.target.value}))}
                  onBlur={() => handleUpdate(c.key)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AdminMessages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: '', category: '', priority: '' })
  const [editingMessage, setEditingMessage] = useState(null)
  const [editForm, setEditForm] = useState({})

  const categories = [
    { key: 'general', label: 'General', color: '#6c757d' },
    { key: 'consulta', label: 'Consulta', color: '#17a2b8' },
    { key: 'soporte', label: 'Soporte Tecnico', color: '#fd7e14' },
    { key: 'reclamo', label: 'Reclamo', color: '#dc3545' },
    { key: 'sugerencia', label: 'Sugerencia', color: '#28a745' },
    { key: 'comercial', label: 'Comercial', color: '#6f42c1' }
  ]

  const priorities = [
    { key: 'baja', label: 'Baja', color: '#28a745' },
    { key: 'normal', label: 'Normal', color: '#17a2b8' },
    { key: 'alta', label: 'Alta', color: '#fd7e14' },
    { key: 'urgente', label: 'Urgente', color: '#dc3545' }
  ]

  const statuses = [
    { key: 'pending', label: 'Pendiente', color: '#ffc107' },
    { key: 'read', label: 'Leido', color: '#17a2b8' },
    { key: 'responded', label: 'Respondido', color: '#28a745' },
    { key: 'closed', label: 'Cerrado', color: '#6c757d' }
  ]

  const loadMessages = () => {
    api.get('/admin/contact-messages').then(r => setMessages(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { loadMessages() }, [])

  const openEditModal = (msg) => {
    setEditingMessage(msg)
    setEditForm({
      status: msg.status || 'pending',
      category: msg.category || 'general',
      priority: msg.priority || 'normal',
      admin_notes: msg.admin_notes || '',
      admin_response: msg.admin_response || ''
    })
  }

  const saveEdit = async () => {
    try {
      await api.put(`/admin/contact-messages/${editingMessage.id}`, editForm)
      setEditingMessage(null)
      loadMessages()
      alert('Mensaje actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al actualizar')
    }
  }

  const deleteMessage = async (id, subject) => {
    if (!confirm(`¿Eliminar mensaje "${subject}"? Esta accion no se puede deshacer.`)) return
    try {
      await api.delete(`/admin/contact-messages/${id}`)
      loadMessages()
      alert('Mensaje eliminado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
    }
  }

  const quickRespond = async (id) => {
    const response = prompt('Escriba su respuesta:')
    if (!response) return
    try {
      await api.put(`/admin/contact-messages/${id}/respond`, { response })
      loadMessages()
      alert('Respuesta enviada')
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  const getBadge = (type, value) => {
    const list = type === 'status' ? statuses : type === 'category' ? categories : priorities
    const item = list.find(i => i.key === value) || list[0]
    return <span style={{background: item.color, color: 'white', padding: '0.2rem 0.5rem', borderRadius: '3px', fontSize: '0.75rem'}}>{item.label}</span>
  }

  const filteredMessages = messages.filter(m => {
    if (filter.status && m.status !== filter.status) return false
    if (filter.category && m.category !== filter.category) return false
    if (filter.priority && m.priority !== filter.priority) return false
    return true
  })

  const stats = {
    total: messages.length,
    pending: messages.filter(m => m.status === 'pending').length,
    urgent: messages.filter(m => m.priority === 'urgente').length
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Mensajes de Contacto</h1>
      
      <div className="stats-grid" style={{marginBottom: '1rem'}}>
        <div className="stat-card card" style={{padding: '0.75rem'}}>
          <h4 style={{margin: 0}}>Total</h4>
          <p className="stat-number" style={{margin: 0}}>{stats.total}</p>
        </div>
        <div className="stat-card card" style={{padding: '0.75rem', borderLeft: '4px solid #ffc107'}}>
          <h4 style={{margin: 0}}>Pendientes</h4>
          <p className="stat-number" style={{margin: 0, color: '#ffc107'}}>{stats.pending}</p>
        </div>
        <div className="stat-card card" style={{padding: '0.75rem', borderLeft: '4px solid #dc3545'}}>
          <h4 style={{margin: 0}}>Urgentes</h4>
          <p className="stat-number" style={{margin: 0, color: '#dc3545'}}>{stats.urgent}</p>
        </div>
      </div>

      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap'}}>
        <select value={filter.status} onChange={e => setFilter({...filter, status: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={filter.category} onChange={e => setFilter({...filter, category: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Todas las categorias</option>
          {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={filter.priority} onChange={e => setFilter({...filter, priority: e.target.value})} style={{padding: '0.5rem'}}>
          <option value="">Todas las prioridades</option>
          {priorities.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <button onClick={() => setFilter({ status: '', category: '', priority: '' })} className="btn btn-sm btn-secondary">Limpiar filtros</button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Remitente</th>
            <th>Asunto</th>
            <th>Categoria</th>
            <th>Prioridad</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filteredMessages.map(m => (
            <tr key={m.id} style={{background: m.priority === 'urgente' ? '#fff5f5' : m.status === 'pending' ? '#fffbf0' : 'inherit'}}>
              <td style={{fontSize: '0.85rem'}}>{new Date(m.created_at).toLocaleDateString('es-BO')}</td>
              <td>
                <div><strong>{m.name}</strong></div>
                <div style={{fontSize: '0.8rem', color: '#666'}}>{m.email}</div>
              </td>
              <td>
                <div style={{fontWeight: '500'}}>{m.subject}</div>
                <div style={{fontSize: '0.8rem', color: '#666', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{m.message}</div>
              </td>
              <td>{getBadge('category', m.category || 'general')}</td>
              <td>{getBadge('priority', m.priority || 'normal')}</td>
              <td>{getBadge('status', m.status)}</td>
              <td>
                <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                  <button onClick={() => openEditModal(m)} className="btn btn-sm btn-secondary">Editar</button>
                  {m.status === 'pending' && (
                    <button onClick={() => quickRespond(m.id)} className="btn btn-sm btn-primary">Responder</button>
                  )}
                  <button onClick={() => deleteMessage(m.id, m.subject)} className="btn btn-sm btn-danger">Eliminar</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredMessages.length === 0 && (
        <p style={{textAlign: 'center', color: '#666', padding: '2rem'}}>No hay mensajes que coincidan con los filtros</p>
      )}

      {editingMessage && (
        <div className="modal-overlay" onClick={() => setEditingMessage(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px'}}>
            <h2>Editar Mensaje</h2>
            
            <div style={{background: '#f8f9fa', padding: '1rem', borderRadius: '8px', marginBottom: '1rem'}}>
              <p style={{margin: 0}}><strong>De:</strong> {editingMessage.name} ({editingMessage.email})</p>
              <p style={{margin: '0.5rem 0'}}><strong>Asunto:</strong> {editingMessage.subject}</p>
              <p style={{margin: 0}}><strong>Mensaje:</strong></p>
              <p style={{margin: '0.5rem 0', whiteSpace: 'pre-wrap', background: 'white', padding: '0.5rem', borderRadius: '4px'}}>{editingMessage.message}</p>
              <p style={{margin: 0, fontSize: '0.8rem', color: '#666'}}>Recibido: {new Date(editingMessage.created_at).toLocaleString('es-BO')}</p>
            </div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem'}}>
              <div>
                <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Estado:</label>
                <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                  {statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Categoria:</label>
                <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                  {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Prioridad:</label>
                <select value={editForm.priority} onChange={e => setEditForm({...editForm, priority: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                  {priorities.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Notas internas (solo admin):</label>
              <textarea 
                value={editForm.admin_notes} 
                onChange={e => setEditForm({...editForm, admin_notes: e.target.value})}
                placeholder="Notas internas para el equipo..."
                style={{width: '100%', padding: '0.5rem', minHeight: '60px'}}
              />
            </div>

            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', marginBottom: '0.25rem', fontWeight: 'bold'}}>Respuesta al usuario:</label>
              <textarea 
                value={editForm.admin_response} 
                onChange={e => setEditForm({...editForm, admin_response: e.target.value})}
                placeholder="Escriba la respuesta que se enviara al usuario..."
                style={{width: '100%', padding: '0.5rem', minHeight: '80px'}}
              />
              {editingMessage.responded_at && (
                <small style={{color: '#666'}}>Respondido: {new Date(editingMessage.responded_at).toLocaleString('es-BO')}</small>
              )}
            </div>

            <div style={{display: 'flex', gap: '1rem', justifyContent: 'flex-end'}}>
              <button onClick={() => setEditingMessage(null)} className="btn btn-secondary">Cancelar</button>
              <button onClick={saveEdit} className="btn btn-primary">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}
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
  const [editingDividend, setEditingDividend] = useState(null)
  const [newEntry, setNewEntry] = useState({ entry_date: '', description: '', entry_type: 'income', debit_account: '1111', credit_account: '4100', amount: '' })
  const [newShareholder, setNewShareholder] = useState({ name: '', document_type: 'ci', document_number: '', email: '', share_percentage: '', capital_contributed: '' })
  const [showNewEntry, setShowNewEntry] = useState(false)
  const [showNewShareholder, setShowNewShareholder] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const [detailModal, setDetailModal] = useState(null)

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

  const deleteDividend = async (id) => {
    if (!confirm('¿Eliminar esta distribución de dividendos?')) return
    try {
      await api.delete(`/admin/accounting/dividends/${id}`)
      loadData()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al eliminar')
    }
  }

  const updateShareholder = async () => {
    try {
      await api.put(`/admin/accounting/shareholders/${editingShareholder.id}`, editingShareholder)
      setEditingShareholder(null)
      loadData()
      alert('Socio actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al actualizar')
    }
  }

  const updateEntry = async () => {
    try {
      await api.put(`/admin/accounting/entries/${editingEntry.id}`, editingEntry)
      setEditingEntry(null)
      loadData()
      alert('Asiento actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al actualizar')
    }
  }

  const updateDividend = async () => {
    try {
      await api.put(`/admin/accounting/dividends/${editingDividend.id}`, editingDividend)
      setEditingDividend(null)
      loadData()
      alert('Dividendo actualizado')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al actualizar')
    }
  }

  const currentMonth = new Date().getMonth() + 1
  const currentMonthEntries = entries.filter(e => {
    const entryMonth = new Date(e.entry_date).getMonth() + 1
    const entryYear = new Date(e.entry_date).getFullYear()
    return entryMonth === currentMonth && entryYear === year
  })

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
            <div className="stat-card card" onClick={() => setDetailModal('capital')} style={{cursor: 'pointer', transition: 'transform 0.2s'}} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
              <h3>Capital Total</h3>
              <p className="stat-number">Bs. {(dashboard.capital?.total || 0).toFixed(2)}</p>
              <span>{dashboard.capital?.shareholders_count || 0} socios activos</span>
              <div style={{marginTop: '0.5rem', fontSize: '0.8rem', color: '#007bff'}}>Click para ver detalles</div>
            </div>
            <div className="stat-card card" onClick={() => setDetailModal('ingresos')} style={{cursor: 'pointer', transition: 'transform 0.2s'}} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
              <h3>Ingresos del Mes</h3>
              <p className="stat-number">Bs. {(dashboard.income?.current_month?.total || 0).toFixed(2)}</p>
              <span>{dashboard.income?.current_month?.count || 0} transacciones</span>
              <div style={{marginTop: '0.5rem', fontSize: '0.8rem', color: '#007bff'}}>Click para ver detalles</div>
            </div>
            <div className="stat-card card" onClick={() => setDetailModal('iva')} style={{cursor: 'pointer', transition: 'transform 0.2s'}} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
              <h3>IVA por Pagar (Mes)</h3>
              <p className="stat-number" style={{color: '#dc3545'}}>Bs. {(dashboard.taxes?.current_month?.iva?.amount || 0).toFixed(2)}</p>
              <span>13% sobre Bs. {(dashboard.taxes?.current_month?.iva?.taxable_base || 0).toFixed(2)}</span>
              <div style={{marginTop: '0.5rem', fontSize: '0.8rem', color: '#007bff'}}>Click para ver detalles</div>
            </div>
            <div className="stat-card card" onClick={() => setDetailModal('it')} style={{cursor: 'pointer', transition: 'transform 0.2s'}} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
              <h3>IT por Pagar (Mes)</h3>
              <p className="stat-number" style={{color: '#fd7e14'}}>Bs. {(dashboard.taxes?.current_month?.it?.amount || 0).toFixed(2)}</p>
              <span>3% sobre Bs. {(dashboard.taxes?.current_month?.it?.transaction_base || 0).toFixed(2)}</span>
              <div style={{marginTop: '0.5rem', fontSize: '0.8rem', color: '#007bff'}}>Click para ver detalles</div>
            </div>
            <div className="stat-card card" onClick={() => setDetailModal('dividendos')} style={{cursor: 'pointer', transition: 'transform 0.2s'}} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
              <h3>Dividendos Pagados</h3>
              <p className="stat-number">Bs. {(dashboard.dividends?.total_paid || 0).toFixed(2)}</p>
              <div style={{marginTop: '0.5rem', fontSize: '0.8rem', color: '#007bff'}}>Click para ver detalles</div>
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
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <h2>Editar Asiento #{editingEntry.entry_number}</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              <label>Fecha: <input type="date" value={editingEntry.entry_date || ''} onChange={e => setEditingEntry({...editingEntry, entry_date: e.target.value})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Tipo: <select value={editingEntry.entry_type} onChange={e => setEditingEntry({...editingEntry, entry_type: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                {Object.entries(entryTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
              <label>Monto: <input type="number" value={editingEntry.amount || ''} onChange={e => setEditingEntry({...editingEntry, amount: parseFloat(e.target.value)})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Descripcion: <input type="text" value={editingEntry.description || ''} onChange={e => setEditingEntry({...editingEntry, description: e.target.value})} style={{width: '100%', padding: '0.5rem'}} /></label>
            </div>
            <div style={{display: 'flex', gap: '0.5rem', marginTop: '1rem'}}>
              <button onClick={updateEntry} className="btn btn-primary">Guardar</button>
              <button onClick={() => setEditingEntry(null)} className="btn btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {editingShareholder && (
        <div className="modal-overlay" onClick={() => setEditingShareholder(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <h2>Editar Socio: {editingShareholder.name}</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              <label>Nombre: <input type="text" value={editingShareholder.name || ''} onChange={e => setEditingShareholder({...editingShareholder, name: e.target.value})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Documento: <input type="text" value={editingShareholder.document_number || ''} onChange={e => setEditingShareholder({...editingShareholder, document_number: e.target.value})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Email: <input type="email" value={editingShareholder.email || ''} onChange={e => setEditingShareholder({...editingShareholder, email: e.target.value})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Participacion (%): <input type="number" value={editingShareholder.share_percentage || ''} onChange={e => setEditingShareholder({...editingShareholder, share_percentage: parseFloat(e.target.value)})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Capital Aportado: <input type="number" value={editingShareholder.capital_contributed || ''} onChange={e => setEditingShareholder({...editingShareholder, capital_contributed: parseFloat(e.target.value)})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Estado: <select value={editingShareholder.status || 'active'} onChange={e => setEditingShareholder({...editingShareholder, status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select></label>
            </div>
            <div style={{display: 'flex', gap: '0.5rem', marginTop: '1rem'}}>
              <button onClick={updateShareholder} className="btn btn-primary">Guardar</button>
              <button onClick={() => setEditingShareholder(null)} className="btn btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {detailModal === 'capital' && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '900px', maxHeight: '80vh', overflow: 'auto'}}>
            <h2>Detalle de Capital - Socios/Accionistas</h2>
            <p style={{color: '#666', marginBottom: '1rem'}}>Capital Total: <strong>Bs. {(capital.total_capital || 0).toFixed(2)}</strong></p>
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
                        <button onClick={() => { setDetailModal(null); setEditingShareholder(s); }} className="btn btn-sm btn-secondary">Editar</button>
                        <button onClick={() => deleteShareholder(s.id)} className="btn btn-sm btn-danger">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shareholders.length === 0 && <p style={{textAlign: 'center', color: '#666', padding: '1rem'}}>No hay socios registrados</p>}
            <button onClick={() => setDetailModal(null)} className="btn btn-secondary" style={{marginTop: '1rem'}}>Cerrar</button>
          </div>
        </div>
      )}

      {detailModal === 'ingresos' && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '900px', maxHeight: '80vh', overflow: 'auto'}}>
            <h2>Ingresos del Mes - {monthNames[currentMonth - 1]} {year}</h2>
            <p style={{color: '#666', marginBottom: '1rem'}}>Total: <strong>Bs. {(dashboard?.income?.current_month?.total || 0).toFixed(2)}</strong> ({currentMonthEntries.length} transacciones)</p>
            <table className="admin-table">
              <thead><tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Descripcion</th><th>Monto</th><th>IVA</th><th>Acciones</th></tr></thead>
              <tbody>
                {currentMonthEntries.map(e => (
                  <tr key={e.id}>
                    <td>{e.entry_number}</td>
                    <td>{e.entry_date}</td>
                    <td>{entryTypes[e.entry_type] || e.entry_type}</td>
                    <td>{e.description}</td>
                    <td>Bs. {(e.amount || 0).toFixed(2)}</td>
                    <td>Bs. {(e.iva_amount || 0).toFixed(2)}</td>
                    <td>
                      <div style={{display: 'flex', gap: '0.25rem'}}>
                        <button onClick={() => { setDetailModal(null); setEditingEntry(e); }} className="btn btn-sm btn-secondary">Editar</button>
                        {!e.is_reconciled && <button onClick={() => deleteEntry(e.id)} className="btn btn-sm btn-danger">Eliminar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {currentMonthEntries.length === 0 && <p style={{textAlign: 'center', color: '#666', padding: '1rem'}}>No hay transacciones este mes</p>}
            <button onClick={() => setDetailModal(null)} className="btn btn-secondary" style={{marginTop: '1rem'}}>Cerrar</button>
          </div>
        </div>
      )}

      {detailModal === 'iva' && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '900px', maxHeight: '80vh', overflow: 'auto'}}>
            <h2>IVA por Pagar - {monthNames[currentMonth - 1]} {year}</h2>
            <div className="card" style={{padding: '1rem', marginBottom: '1rem', background: '#f8f9fa'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center'}}>
                <div><strong>Base Imponible</strong><br/>Bs. {(dashboard?.taxes?.current_month?.iva?.taxable_base || 0).toFixed(2)}</div>
                <div><strong>Tasa IVA</strong><br/>13%</div>
                <div><strong>IVA a Pagar</strong><br/><span style={{color: '#dc3545', fontSize: '1.2rem'}}>Bs. {(dashboard?.taxes?.current_month?.iva?.amount || 0).toFixed(2)}</span></div>
              </div>
            </div>
            <h4>Transacciones del Mes con IVA</h4>
            <table className="admin-table">
              <thead><tr><th>Fecha</th><th>Descripcion</th><th>Base</th><th>IVA (13%)</th><th>Acciones</th></tr></thead>
              <tbody>
                {currentMonthEntries.filter(e => e.entry_type === 'income').map(e => (
                  <tr key={e.id}>
                    <td>{e.entry_date}</td>
                    <td>{e.description}</td>
                    <td>Bs. {(e.amount || 0).toFixed(2)}</td>
                    <td>Bs. {((e.amount || 0) * 0.13).toFixed(2)}</td>
                    <td>
                      <button onClick={() => { setDetailModal(null); setEditingEntry(e); }} className="btn btn-sm btn-secondary">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {currentMonthEntries.filter(e => e.entry_type === 'income').length === 0 && <p style={{textAlign: 'center', color: '#666', padding: '1rem'}}>No hay transacciones con IVA este mes</p>}
            <button onClick={() => setDetailModal(null)} className="btn btn-secondary" style={{marginTop: '1rem'}}>Cerrar</button>
          </div>
        </div>
      )}

      {detailModal === 'it' && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '900px', maxHeight: '80vh', overflow: 'auto'}}>
            <h2>IT por Pagar - {monthNames[currentMonth - 1]} {year}</h2>
            <div className="card" style={{padding: '1rem', marginBottom: '1rem', background: '#f8f9fa'}}>
              <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center'}}>
                <div><strong>Base Transacciones</strong><br/>Bs. {(dashboard?.taxes?.current_month?.it?.transaction_base || 0).toFixed(2)}</div>
                <div><strong>Tasa IT</strong><br/>3%</div>
                <div><strong>IT a Pagar</strong><br/><span style={{color: '#fd7e14', fontSize: '1.2rem'}}>Bs. {(dashboard?.taxes?.current_month?.it?.amount || 0).toFixed(2)}</span></div>
              </div>
            </div>
            <h4>Transacciones del Mes con IT</h4>
            <table className="admin-table">
              <thead><tr><th>Fecha</th><th>Descripcion</th><th>Monto</th><th>IT (3%)</th><th>Acciones</th></tr></thead>
              <tbody>
                {currentMonthEntries.map(e => (
                  <tr key={e.id}>
                    <td>{e.entry_date}</td>
                    <td>{e.description}</td>
                    <td>Bs. {(e.amount || 0).toFixed(2)}</td>
                    <td>Bs. {((e.amount || 0) * 0.03).toFixed(2)}</td>
                    <td>
                      <button onClick={() => { setDetailModal(null); setEditingEntry(e); }} className="btn btn-sm btn-secondary">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {currentMonthEntries.length === 0 && <p style={{textAlign: 'center', color: '#666', padding: '1rem'}}>No hay transacciones este mes</p>}
            <button onClick={() => setDetailModal(null)} className="btn btn-secondary" style={{marginTop: '1rem'}}>Cerrar</button>
          </div>
        </div>
      )}

      {detailModal === 'dividendos' && (
        <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '900px', maxHeight: '80vh', overflow: 'auto'}}>
            <h2>Dividendos Distribuidos</h2>
            <p style={{color: '#666', marginBottom: '1rem'}}>Total Pagado: <strong>Bs. {(dashboard?.dividends?.total_paid || 0).toFixed(2)}</strong></p>
            <table className="admin-table">
              <thead><tr><th>Año Fiscal</th><th>Utilidad Total</th><th>Reserva Legal</th><th>Distribuible</th><th>Distribuido</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                {dividends.map(d => (
                  <tr key={d.id}>
                    <td>{d.fiscal_year}</td>
                    <td>Bs. {(d.total_profit || 0).toFixed(2)}</td>
                    <td>Bs. {(d.legal_reserve || 0).toFixed(2)}</td>
                    <td>Bs. {(d.distributable_profit || 0).toFixed(2)}</td>
                    <td>Bs. {(d.total_distributed || 0).toFixed(2)}</td>
                    <td><span className={`status-badge status-${d.status}`}>{d.status}</span></td>
                    <td>
                      <div style={{display: 'flex', gap: '0.25rem'}}>
                        <button onClick={() => { setDetailModal(null); setEditingDividend(d); }} className="btn btn-sm btn-secondary">Editar</button>
                        {d.status !== 'paid' && <button onClick={() => deleteDividend(d.id)} className="btn btn-sm btn-danger">Eliminar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dividends.length === 0 && <p style={{textAlign: 'center', color: '#666', padding: '1rem'}}>No hay distribuciones de dividendos</p>}
            <button onClick={() => setDetailModal(null)} className="btn btn-secondary" style={{marginTop: '1rem'}}>Cerrar</button>
          </div>
        </div>
      )}

      {editingDividend && (
        <div className="modal-overlay" onClick={() => setEditingDividend(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <h2>Editar Dividendo - {editingDividend.fiscal_year}</h2>
            <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
              <label>Utilidad Total: <input type="number" value={editingDividend.total_profit || ''} onChange={e => setEditingDividend({...editingDividend, total_profit: parseFloat(e.target.value)})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Reserva Legal: <input type="number" value={editingDividend.legal_reserve || ''} onChange={e => setEditingDividend({...editingDividend, legal_reserve: parseFloat(e.target.value)})} style={{width: '100%', padding: '0.5rem'}} /></label>
              <label>Estado: <select value={editingDividend.status || 'pending'} onChange={e => setEditingDividend({...editingDividend, status: e.target.value})} style={{width: '100%', padding: '0.5rem'}}>
                <option value="pending">Pendiente</option>
                <option value="approved">Aprobado</option>
                <option value="paid">Pagado</option>
              </select></label>
            </div>
            <div style={{display: 'flex', gap: '0.5rem', marginTop: '1rem'}}>
              <button onClick={updateDividend} className="btn btn-primary">Guardar</button>
              <button onClick={() => setEditingDividend(null)} className="btn btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AdminExport() {
  const [exporting, setExporting] = useState(false)
  const [exportModal, setExportModal] = useState(null)
  const [exportOptions, setExportOptions] = useState({ format: 'excel', filename: '' })

  const exportTypes = [
    { key: 'users', label: 'Usuarios', icon: '👤' },
    { key: 'spaces', label: 'Espacios', icon: '🏢' },
    { key: 'reservations', label: 'Reservaciones', icon: '📅' },
    { key: 'contracts', label: 'Contratos', icon: '📄' },
    { key: 'payments', label: 'Pagos', icon: '💳' },
    { key: 'invoices', label: 'Facturas', icon: '🧾' },
    { key: 'audit', label: 'Auditoria', icon: '📋' },
    { key: 'notification_log', label: 'Log Notificaciones', icon: '🔔' },
    { key: 'legal_texts', label: 'Textos Legales', icon: '⚖️' }
  ]

  const formats = [
    { key: 'excel', label: 'Excel (.xlsx)', icon: '📊', desc: 'Ideal para analisis y edicion' },
    { key: 'pdf', label: 'PDF (.pdf)', icon: '📕', desc: 'Ideal para imprimir o compartir' },
    { key: 'json', label: 'JSON (.json)', icon: '💾', desc: 'Ideal para respaldo o integracion' }
  ]

  const openExportModal = (type) => {
    const typeInfo = exportTypes.find(t => t.key === type)
    const defaultFilename = `${typeInfo.label}_${new Date().toISOString().split('T')[0]}`
    setExportOptions({ format: 'excel', filename: defaultFilename })
    setExportModal(type)
  }

  const handleExport = async (action) => {
    if (!exportModal) return
    setExporting(true)
    
    try {
      const format = exportOptions.format
      const filename = exportOptions.filename || `export_${exportModal}`
      const ext = format === 'excel' ? 'xlsx' : format
      
      if (action === 'print') {
        const response = await api.get(`/admin/export/${exportModal}?format=json`)
        const data = response.data.data || []
        
        const printWindow = window.open('', '_blank')
        const typeInfo = exportTypes.find(t => t.key === exportModal)
        
        let tableHtml = '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">'
        if (data.length > 0) {
          const cols = Object.keys(data[0])
          tableHtml += '<thead style="background: #4472c4; color: white;"><tr>'
          cols.forEach(col => { tableHtml += `<th>${col.toUpperCase()}</th>` })
          tableHtml += '</tr></thead><tbody>'
          data.slice(0, 100).forEach((row, idx) => {
            tableHtml += `<tr style="background: ${idx % 2 === 0 ? '#f8f9fa' : 'white'}">`
            cols.forEach(col => { tableHtml += `<td>${row[col] || '-'}</td>` })
            tableHtml += '</tr>'
          })
          if (data.length > 100) {
            tableHtml += `<tr><td colspan="${cols.length}" style="text-align: center; color: #666;">... y ${data.length - 100} registros mas</td></tr>`
          }
          tableHtml += '</tbody>'
        }
        tableHtml += '</table>'
        
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${typeInfo.label} - Almacenes Galpones</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { text-align: center; color: #333; }
              .info { text-align: center; color: #666; margin-bottom: 20px; }
              table { font-size: 11px; }
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <h1>${typeInfo.icon} ${typeInfo.label}</h1>
            <p class="info">Exportado: ${new Date().toLocaleString('es-BO')} | Total: ${data.length} registros</p>
            <button onclick="window.print()" style="padding: 10px 20px; margin-bottom: 20px; cursor: pointer;">Imprimir</button>
            ${tableHtml}
          </body>
          </html>
        `)
        printWindow.document.close()
        setExportModal(null)
        setExporting(false)
        return
      }
      
      const response = await api.get(`/admin/export/${exportModal}?format=${format}`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `${filename}.${ext}`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      setExportModal(null)
      alert('Exportacion completada')
    } catch (error) {
      console.error('Export error:', error)
      alert('Error al exportar: ' + (error.response?.data?.error || error.message))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <h1>Exportar Datos</h1>
      <p style={{marginBottom: '1rem', color: '#666'}}>Seleccione el tipo de datos que desea exportar. Puede elegir formato y nombre de archivo.</p>
      
      <div className="export-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem'}}>
        {exportTypes.map(t => (
          <button 
            key={t.key} 
            onClick={() => openExportModal(t.key)} 
            className="btn btn-secondary" 
            style={{padding: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem'}}
          >
            <span style={{fontSize: '1.5rem'}}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {exportModal && (
        <div className="modal-overlay" onClick={() => !exporting && setExportModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <h2 style={{marginBottom: '1rem'}}>
              {exportTypes.find(t => t.key === exportModal)?.icon} Exportar {exportTypes.find(t => t.key === exportModal)?.label}
            </h2>
            
            <div style={{marginBottom: '1.5rem'}}>
              <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 'bold'}}>Formato de exportacion:</label>
              <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                {formats.map(f => (
                  <label 
                    key={f.key} 
                    style={{
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.75rem', 
                      padding: '0.75rem', 
                      border: exportOptions.format === f.key ? '2px solid #007bff' : '1px solid #ddd',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: exportOptions.format === f.key ? '#f0f7ff' : 'white'
                    }}
                  >
                    <input 
                      type="radio" 
                      name="format" 
                      value={f.key} 
                      checked={exportOptions.format === f.key}
                      onChange={e => setExportOptions({...exportOptions, format: e.target.value})}
                    />
                    <span style={{fontSize: '1.25rem'}}>{f.icon}</span>
                    <div>
                      <div style={{fontWeight: '500'}}>{f.label}</div>
                      <div style={{fontSize: '0.8rem', color: '#666'}}>{f.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            
            <div style={{marginBottom: '1.5rem'}}>
              <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 'bold'}}>Nombre del archivo:</label>
              <input 
                type="text" 
                value={exportOptions.filename} 
                onChange={e => setExportOptions({...exportOptions, filename: e.target.value})}
                placeholder="Nombre del archivo (sin extension)"
                style={{width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '4px'}}
              />
              <small style={{color: '#666'}}>Extension: .{exportOptions.format === 'excel' ? 'xlsx' : exportOptions.format}</small>
            </div>

            <div style={{marginBottom: '1.5rem', padding: '0.75rem', background: '#e7f3ff', borderRadius: '8px', border: '1px solid #b8daff'}}>
              <p style={{margin: 0, fontSize: '0.85rem', color: '#004085'}}>
                <strong>📂 Ubicacion de descarga:</strong><br/>
                El archivo se guardara en su carpeta de <strong>Descargas</strong>.<br/>
                <span style={{fontSize: '0.8rem'}}>
                  Para elegir la ubicacion manualmente, configure su navegador:<br/>
                  • <strong>Chrome/Edge:</strong> Configuracion → Descargas → "Preguntar donde guardar"<br/>
                  • <strong>Firefox:</strong> Preferencias → Archivos y aplicaciones → "Preguntar siempre"<br/>
                  • <strong>Movil:</strong> Los archivos se guardan en la carpeta Descargas del dispositivo
                </span>
              </p>
            </div>
            
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem'}}>
              <button 
                onClick={() => handleExport('download')} 
                disabled={exporting}
                className="btn btn-primary"
                style={{padding: '0.75rem'}}
              >
                {exporting ? 'Exportando...' : '⬇️ Descargar Archivo'}
              </button>
              <button 
                onClick={() => handleExport('print')} 
                disabled={exporting}
                className="btn btn-secondary"
                style={{padding: '0.75rem'}}
              >
                🖨️ Imprimir Directo
              </button>
            </div>
            
            <button 
              onClick={() => setExportModal(null)} 
              disabled={exporting}
              className="btn btn-link"
              style={{marginTop: '1rem', width: '100%', color: '#666'}}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// #2: REPORTES AVANZADOS
// ============================================
function AdminReports() {
  const [data, setData] = useState(null)
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ start: '', end: '' })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [reportsRes, kpisRes] = await Promise.all([
        api.get('/admin/reports/overview'),
        api.get('/admin/reports/kpis')
      ])
      setData(reportsRes.data)
      setKpis(kpisRes.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Reportes y Analiticas</h1>
      
      <div className="stats-grid" style={{marginBottom: '2rem'}}>
        <div className="stat-card card">
          <h3>Ingresos Totales</h3>
          <p className="stat-number">Bs. {kpis?.total_revenue?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="stat-card card">
          <h3>Ingresos (30 dias)</h3>
          <p className="stat-number">Bs. {kpis?.monthly_revenue?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="stat-card card">
          <h3>Comisiones Totales</h3>
          <p className="stat-number">Bs. {kpis?.total_commissions?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="stat-card card">
          <h3>Contratos Activos</h3>
          <p className="stat-number">{kpis?.active_contracts || 0}</p>
        </div>
        <div className="stat-card card">
          <h3>Verificaciones Pendientes</h3>
          <p className="stat-number">{kpis?.pending_verifications || 0}</p>
        </div>
        <div className="stat-card card">
          <h3>Disputas Abiertas</h3>
          <p className="stat-number">{kpis?.open_disputes || 0}</p>
        </div>
        <div className="stat-card card">
          <h3>Tasa de Conversion</h3>
          <p className="stat-number">{kpis?.conversion_rate || 0}%</p>
        </div>
        <div className="stat-card card">
          <h3>Valor Promedio Contrato</h3>
          <p className="stat-number">Bs. {kpis?.avg_contract_value?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="stat-card card">
          <h3>Balance Escrow</h3>
          <p className="stat-number">Bs. {kpis?.escrow_balance?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="stat-card card">
          <h3>Nuevos Usuarios (30d)</h3>
          <p className="stat-number">{kpis?.new_users_30d || 0}</p>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem'}}>
        <div className="card" style={{padding: '1.5rem'}}>
          <h3>Top 10 Hosts por Ingresos</h3>
          <table className="admin-table" style={{marginTop: '1rem'}}>
            <thead>
              <tr><th>Host</th><th>Contratos</th><th>Ingresos</th></tr>
            </thead>
            <tbody>
              {data?.topHosts?.map(h => (
                <tr key={h.id}>
                  <td>{h.first_name} {h.last_name || h.company_name}</td>
                  <td>{h.contracts_count}</td>
                  <td>Bs. {h.total_revenue?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card" style={{padding: '1.5rem'}}>
          <h3>Top 10 Espacios por Ingresos</h3>
          <table className="admin-table" style={{marginTop: '1rem'}}>
            <thead>
              <tr><th>Espacio</th><th>Reservas</th><th>Ingresos</th></tr>
            </thead>
            <tbody>
              {data?.topSpaces?.map(s => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td>{s.reservations_count}</td>
                  <td>Bs. {s.total_revenue?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{padding: '1.5rem', marginTop: '2rem'}}>
        <h3>Ingresos Mensuales</h3>
        <table className="admin-table" style={{marginTop: '1rem'}}>
          <thead>
            <tr><th>Mes</th><th>Transacciones</th><th>Total</th></tr>
          </thead>
          <tbody>
            {data?.revenue?.map(r => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td>{r.count}</td>
                <td>Bs. {r.total?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================
// #3: GESTION DE DISPUTAS
// ============================================
function AdminDisputes() {
  const [data, setData] = useState({ disputes: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [selectedDispute, setSelectedDispute] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({})

  useEffect(() => { loadData() }, [filterStatus])

  const loadData = async () => {
    setLoading(true)
    try {
      const url = filterStatus ? `/admin/disputes?status=${filterStatus}` : '/admin/disputes'
      const response = await api.get(url)
      setData(response.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDisputeDetails = async (id) => {
    try {
      const response = await api.get(`/admin/disputes/${id}`)
      setSelectedDispute(response.data)
    } catch (error) {
      alert('Error al cargar detalles')
    }
  }

  const handleUpdate = async (id, updates) => {
    try {
      await api.put(`/admin/disputes/${id}`, updates)
      alert('Disputa actualizada')
      loadData()
      if (selectedDispute?.id === id) loadDisputeDetails(id)
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!form.comment) return
    try {
      await api.post(`/admin/disputes/${selectedDispute.id}/comments`, {
        comment: form.comment,
        is_internal: form.is_internal || false
      })
      setForm({})
      loadDisputeDetails(selectedDispute.id)
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const statusColors = {
    open: '#ef4444', in_review: '#f59e0b', awaiting_response: '#3b82f6',
    resolved_favor_guest: '#10b981', resolved_favor_host: '#10b981',
    resolved_mutual: '#10b981', closed: '#6b7280', escalated: '#dc2626'
  }

  const statusLabels = {
    open: 'Abierta', in_review: 'En Revision', awaiting_response: 'Esperando Respuesta',
    resolved_favor_guest: 'Resuelta (Cliente)', resolved_favor_host: 'Resuelta (Host)',
    resolved_mutual: 'Resuelta (Mutuo)', closed: 'Cerrada', escalated: 'Escalada'
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Gestion de Disputas</h1>
      
      <div className="stats-grid" style={{marginBottom: '1.5rem'}}>
        <div className="stat-card card"><h4>Total</h4><p className="stat-number">{data.stats.total}</p></div>
        <div className="stat-card card" style={{borderLeft: '4px solid #ef4444'}}><h4>Abiertas</h4><p className="stat-number">{data.stats.open}</p></div>
        <div className="stat-card card" style={{borderLeft: '4px solid #f59e0b'}}><h4>En Revision</h4><p className="stat-number">{data.stats.in_review}</p></div>
        <div className="stat-card card" style={{borderLeft: '4px solid #dc2626'}}><h4>Urgentes</h4><p className="stat-number">{data.stats.urgent}</p></div>
      </div>

      <div style={{marginBottom: '1rem'}}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding: '0.5rem'}}>
          <option value="">Todos los estados</option>
          <option value="open">Abiertas</option>
          <option value="in_review">En Revision</option>
          <option value="awaiting_response">Esperando Respuesta</option>
          <option value="escalated">Escaladas</option>
        </select>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: selectedDispute ? '1fr 1fr' : '1fr', gap: '1.5rem'}}>
        <div>
          <table className="admin-table">
            <thead>
              <tr><th>N°</th><th>Asunto</th><th>Demandante</th><th>Estado</th><th>Prioridad</th><th>Fecha</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {data.disputes.map(d => (
                <tr key={d.id} style={{background: selectedDispute?.id === d.id ? '#e7f3ff' : ''}}>
                  <td>{d.dispute_number}</td>
                  <td>{d.subject}</td>
                  <td>{d.complainant_first_name} {d.complainant_last_name}</td>
                  <td><span className="badge" style={{background: statusColors[d.status]}}>{statusLabels[d.status]}</span></td>
                  <td><span className="badge" style={{background: d.priority === 'urgent' ? '#dc2626' : d.priority === 'high' ? '#f59e0b' : '#6b7280'}}>{d.priority}</span></td>
                  <td>{new Date(d.created_at).toLocaleDateString()}</td>
                  <td><button onClick={() => loadDisputeDetails(d.id)} className="btn btn-small">Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selectedDispute && (
          <div className="card" style={{padding: '1.5rem'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
              <h3>{selectedDispute.dispute_number}</h3>
              <button onClick={() => setSelectedDispute(null)} className="btn btn-small">X</button>
            </div>
            <p><strong>Asunto:</strong> {selectedDispute.subject}</p>
            <p><strong>Categoria:</strong> {selectedDispute.category}</p>
            <p><strong>Demandante:</strong> {selectedDispute.complainant_first_name} {selectedDispute.complainant_last_name} ({selectedDispute.complainant_email})</p>
            <p><strong>Demandado:</strong> {selectedDispute.respondent_first_name} {selectedDispute.respondent_last_name} ({selectedDispute.respondent_email})</p>
            <p><strong>Descripcion:</strong> {selectedDispute.description}</p>

            <div style={{marginTop: '1rem'}}>
              <label>Cambiar Estado:</label>
              <select value={selectedDispute.status} onChange={e => handleUpdate(selectedDispute.id, { status: e.target.value })} style={{marginLeft: '0.5rem', padding: '0.25rem'}}>
                <option value="open">Abierta</option>
                <option value="in_review">En Revision</option>
                <option value="awaiting_response">Esperando Respuesta</option>
                <option value="resolved_favor_guest">Resuelta (Cliente)</option>
                <option value="resolved_favor_host">Resuelta (Host)</option>
                <option value="resolved_mutual">Resuelta (Mutuo)</option>
                <option value="escalated">Escalada</option>
                <option value="closed">Cerrada</option>
              </select>
            </div>

            <h4 style={{marginTop: '1.5rem'}}>Comentarios ({selectedDispute.comments?.length || 0})</h4>
            <div style={{maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem'}}>
              {selectedDispute.comments?.map(c => (
                <div key={c.id} style={{padding: '0.5rem', marginBottom: '0.5rem', background: c.is_internal ? '#fff3cd' : '#f8f9fa', borderRadius: '4px'}}>
                  <small><strong>{c.first_name} {c.last_name}</strong> - {new Date(c.created_at).toLocaleString()}{c.is_internal ? ' (Interno)' : ''}</small>
                  <p style={{margin: '0.25rem 0 0'}}>{c.comment}</p>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddComment}>
              <textarea value={form.comment || ''} onChange={e => setForm({...form, comment: e.target.value})} placeholder="Agregar comentario..." style={{width: '100%', padding: '0.5rem', marginBottom: '0.5rem'}} rows="2"></textarea>
              <label style={{display: 'block', marginBottom: '0.5rem'}}><input type="checkbox" checked={form.is_internal || false} onChange={e => setForm({...form, is_internal: e.target.checked})} /> Comentario interno (no visible para usuarios)</label>
              <button type="submit" className="btn btn-primary btn-small">Agregar Comentario</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// #7: ROLES Y PERMISOS
// ============================================
function AdminRoles() {
  const [roles, setRoles] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('roles')
  const [showModal, setShowModal] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [rolesRes, adminUsersRes, usersRes] = await Promise.all([
        api.get('/admin/roles'),
        api.get('/admin/admin-users'),
        api.get('/admin/users')
      ])
      setRoles(rolesRes.data)
      setAdminUsers(adminUsersRes.data)
      setUsers(usersRes.data.filter(u => u.role !== 'ADMIN'))
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRole = async (e) => {
    e.preventDefault()
    try {
      if (form.id) {
        await api.put(`/admin/roles/${form.id}`, form)
      } else {
        await api.post('/admin/roles', form)
      }
      alert('Rol guardado')
      setShowModal(null)
      setForm({})
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleDeleteRole = async (id) => {
    if (!confirm('Eliminar este rol?')) return
    try {
      await api.delete(`/admin/roles/${id}`)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleAddAdmin = async (e) => {
    e.preventDefault()
    try {
      await api.post('/admin/admin-users', form)
      alert('Administrador agregado')
      setShowModal(null)
      setForm({})
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleRemoveAdmin = async (id) => {
    if (!confirm('Quitar permisos de administrador?')) return
    try {
      await api.delete(`/admin/admin-users/${id}`)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const toggleSuperAdmin = async (userId, currentStatus) => {
    const action = currentStatus ? 'degradar de Super Admin' : 'promover a Super Admin'
    if (!confirm(`¿Está seguro de que desea ${action} a este usuario?`)) return
    try {
      await api.put(`/admin/users/${userId}/super-admin`, { is_super_admin: !currentStatus })
      alert(currentStatus ? 'Usuario degradado de Super Admin' : 'Usuario promovido a Super Admin')
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Roles y Administradores</h1>
      
      <div style={{marginBottom: '1rem'}}>
        <button onClick={() => setActiveTab('roles')} className={`btn ${activeTab === 'roles' ? 'btn-primary' : 'btn-secondary'}`} style={{marginRight: '0.5rem'}}>Roles</button>
        <button onClick={() => setActiveTab('admins')} className={`btn ${activeTab === 'admins' ? 'btn-primary' : 'btn-secondary'}`}>Administradores</button>
      </div>

      {activeTab === 'roles' && (
        <div>
          <button onClick={() => { setForm({}); setShowModal('role') }} className="btn btn-primary" style={{marginBottom: '1rem'}}>+ Nuevo Rol</button>
          <table className="admin-table">
            <thead>
              <tr><th>Nombre</th><th>Descripcion</th><th>Usuarios</th><th>Sistema</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {roles.map(r => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.description}</td>
                  <td>{r.users_count}</td>
                  <td>{r.is_system ? 'Si' : 'No'}</td>
                  <td>
                    {!r.is_system && (
                      <>
                        <button onClick={async () => { 
                          try {
                            const res = await api.get(`/admin/roles/${r.id}`)
                            setForm(res.data)
                            setShowModal('role')
                          } catch (e) { setForm(r); setShowModal('role') }
                        }} className="btn btn-small" style={{marginRight: '0.25rem'}}>Editar</button>
                        <button onClick={() => handleDeleteRole(r.id)} className="btn btn-small btn-danger">Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'admins' && (
        <div>
          <button onClick={() => { setForm({}); setShowModal('admin') }} className="btn btn-primary" style={{marginBottom: '1rem'}}>+ Agregar Administrador</button>
          <table className="admin-table">
            <thead>
              <tr><th>Usuario</th><th>Email</th><th>Tipo</th><th>MFA</th><th>Ultimo Login</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {adminUsers.map(a => (
                <tr key={a.id}>
                  <td>{a.first_name} {a.last_name}</td>
                  <td>{a.email}</td>
                  <td>
                    <span style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      background: a.is_super_admin ? '#dc3545' : '#fd7e14',
                      color: 'white'
                    }}>
                      {a.is_super_admin ? 'SUPER ADMIN' : 'ADMIN'}
                    </span>
                  </td>
                  <td>{a.mfa_enabled ? 'Activo' : 'No'}</td>
                  <td>{a.last_login ? new Date(a.last_login).toLocaleString() : 'Nunca'}</td>
                  <td>
                    <div style={{display: 'flex', gap: '0.25rem', flexWrap: 'wrap'}}>
                      <button 
                        onClick={() => toggleSuperAdmin(a.user_id, a.is_super_admin)} 
                        className={`btn btn-small ${a.is_super_admin ? 'btn-warning' : 'btn-success'}`}
                        title={a.is_super_admin ? 'Degradar a Admin normal' : 'Promover a Super Admin'}
                      >
                        {a.is_super_admin ? 'Degradar' : 'Promover'}
                      </button>
                      <button onClick={() => handleRemoveAdmin(a.id)} className="btn btn-small btn-danger">Quitar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal === 'role' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto'}}>
            <h2>{form.id ? 'Editar' : 'Nuevo'} Rol</h2>
            <form onSubmit={handleSaveRole}>
              <div className="form-group">
                <label>Nombre</label>
                <input type="text" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Descripcion</label>
                <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} rows="2"></textarea>
              </div>
              <div className="form-group">
                <label style={{marginBottom: '0.5rem', display: 'block'}}>Permisos por Seccion</label>
                <table className="admin-table" style={{fontSize: '0.85rem'}}>
                  <thead>
                    <tr><th>Seccion</th><th>Ver</th><th>Crear</th><th>Editar</th><th>Eliminar</th></tr>
                  </thead>
                  <tbody>
                    {['dashboard', 'reports', 'clients', 'hosts', 'host-verifications', 'users', 'admin-roles', 'spaces', 'reservations', 'contracts', 'disputes', 'payments', 'security-deposits', 'invoices', 'host-statements', 'payment-methods', 'campaigns', 'badges', 'faq', 'alerts', 'config', 'legal-texts', 'notifications', 'audit-log', 'accounting', 'export', 'messages'].map(section => {
                      const perm = (form.permissions || []).find(p => p.section === section) || { section, can_view: false, can_create: false, can_edit: false, can_delete: false }
                      const updatePerm = (field, value) => {
                        const perms = [...(form.permissions || [])]
                        const idx = perms.findIndex(p => p.section === section)
                        if (idx >= 0) {
                          perms[idx] = { ...perms[idx], [field]: value }
                        } else {
                          perms.push({ section, can_view: false, can_create: false, can_edit: false, can_delete: false, [field]: value })
                        }
                        setForm({ ...form, permissions: perms })
                      }
                      return (
                        <tr key={section}>
                          <td style={{textTransform: 'capitalize'}}>{section.replace(/-/g, ' ')}</td>
                          <td style={{textAlign: 'center'}}><input type="checkbox" checked={perm.can_view} onChange={e => updatePerm('can_view', e.target.checked)} /></td>
                          <td style={{textAlign: 'center'}}><input type="checkbox" checked={perm.can_create} onChange={e => updatePerm('can_create', e.target.checked)} /></td>
                          <td style={{textAlign: 'center'}}><input type="checkbox" checked={perm.can_edit} onChange={e => updatePerm('can_edit', e.target.checked)} /></td>
                          <td style={{textAlign: 'center'}}><input type="checkbox" checked={perm.can_delete} onChange={e => updatePerm('can_delete', e.target.checked)} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{marginTop: '0.5rem', display: 'flex', gap: '0.5rem'}}>
                  <button type="button" className="btn btn-small btn-secondary" onClick={() => {
                    const allPerms = ['dashboard', 'reports', 'clients', 'hosts', 'host-verifications', 'users', 'admin-roles', 'spaces', 'reservations', 'contracts', 'disputes', 'payments', 'security-deposits', 'invoices', 'host-statements', 'payment-methods', 'campaigns', 'badges', 'faq', 'alerts', 'config', 'legal-texts', 'notifications', 'audit-log', 'accounting', 'export', 'messages'].map(s => ({ section: s, can_view: true, can_create: true, can_edit: true, can_delete: true }))
                    setForm({ ...form, permissions: allPerms })
                  }}>Seleccionar Todos</button>
                  <button type="button" className="btn btn-small btn-secondary" onClick={() => setForm({ ...form, permissions: [] })}>Limpiar Todos</button>
                </div>
              </div>
              <div style={{display: 'flex', gap: '0.5rem', marginTop: '1rem'}}>
                <button type="submit" className="btn btn-primary">Guardar</button>
                <button type="button" onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal === 'admin' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Agregar Administrador</h2>
            <form onSubmit={handleAddAdmin}>
              <div className="form-group">
                <label>Usuario</label>
                <select value={form.user_id || ''} onChange={e => setForm({...form, user_id: e.target.value})} required>
                  <option value="">Seleccionar usuario...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.first_name} {u.last_name})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Rol</label>
                <select value={form.role_id || ''} onChange={e => setForm({...form, role_id: e.target.value})} required>
                  <option value="">Seleccionar rol...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button type="submit" className="btn btn-primary">Agregar</button>
                <button type="button" onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// #8: VERIFICACION DE HOSTS
// ============================================
function AdminHostVerifications() {
  const [data, setData] = useState({ verifications: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { loadData() }, [filterStatus])

  const loadData = async () => {
    setLoading(true)
    try {
      const url = filterStatus ? `/admin/host-verifications?status=${filterStatus}` : '/admin/host-verifications'
      const response = await api.get(url)
      setData(response.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleReview = async (id, status, notes) => {
    try {
      await api.put(`/admin/host-verifications/${id}`, { status, review_notes: notes, rejection_reason: status === 'rejected' ? notes : null })
      alert('Verificacion actualizada')
      setShowModal(null)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const docTypeLabels = { ci: 'Carnet de Identidad', pasaporte: 'Pasaporte', nit: 'NIT', comprobante_domicilio: 'Comprobante Domicilio', licencia_actividad: 'Licencia Actividad' }
  const statusColors = { pending: '#f59e0b', in_review: '#3b82f6', approved: '#10b981', rejected: '#ef4444' }
  const statusLabels = { pending: 'Pendiente', in_review: 'En Revision', approved: 'Aprobado', rejected: 'Rechazado' }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Verificacion de Hosts</h1>
      
      <div className="stats-grid" style={{marginBottom: '1.5rem'}}>
        <div className="stat-card card"><h4>Total</h4><p className="stat-number">{data.stats.total}</p></div>
        <div className="stat-card card" style={{borderLeft: '4px solid #f59e0b'}}><h4>Pendientes</h4><p className="stat-number">{data.stats.pending}</p></div>
        <div className="stat-card card" style={{borderLeft: '4px solid #3b82f6'}}><h4>En Revision</h4><p className="stat-number">{data.stats.in_review}</p></div>
        <div className="stat-card card" style={{borderLeft: '4px solid #10b981'}}><h4>Aprobados</h4><p className="stat-number">{data.stats.approved}</p></div>
      </div>

      <div style={{marginBottom: '1rem'}}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{padding: '0.5rem'}}>
          <option value="">Todos</option>
          <option value="pending">Pendientes</option>
          <option value="in_review">En Revision</option>
          <option value="approved">Aprobados</option>
          <option value="rejected">Rechazados</option>
        </select>
      </div>

      <table className="admin-table">
        <thead>
          <tr><th>Host</th><th>Email</th><th>Documento</th><th>Numero</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {data.verifications.map(v => (
            <tr key={v.id}>
              <td>{v.first_name} {v.last_name || v.company_name}</td>
              <td>{v.email}</td>
              <td>{docTypeLabels[v.document_type]}</td>
              <td>{v.document_number || '-'}</td>
              <td><span className="badge" style={{background: statusColors[v.status]}}>{statusLabels[v.status]}</span></td>
              <td>{new Date(v.created_at).toLocaleDateString()}</td>
              <td>
                <a href={v.document_url} target="_blank" className="btn btn-small" style={{marginRight: '0.25rem'}}>Ver Doc</a>
                {v.status !== 'approved' && <button onClick={() => { setForm(v); setShowModal('review') }} className="btn btn-small btn-primary">Revisar</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal === 'review' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Revisar Documento</h2>
            <p><strong>Host:</strong> {form.first_name} {form.last_name}</p>
            <p><strong>Tipo:</strong> {docTypeLabels[form.document_type]}</p>
            <p><strong>Numero:</strong> {form.document_number || 'No especificado'}</p>
            <div className="form-group">
              <label>Notas de revision</label>
              <textarea value={form.review_notes || ''} onChange={e => setForm({...form, review_notes: e.target.value})} rows="3" placeholder="Notas opcionales..."></textarea>
            </div>
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button onClick={() => handleReview(form.id, 'approved', form.review_notes)} className="btn btn-primary">Aprobar</button>
              <button onClick={() => handleReview(form.id, 'in_review', form.review_notes)} className="btn btn-secondary">Marcar En Revision</button>
              <button onClick={() => handleReview(form.id, 'rejected', form.review_notes)} className="btn btn-danger">Rechazar</button>
              <button onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// #9: CAMPANAS
// ============================================
function AdminCampaigns() {
  const [data, setData] = useState({ campaigns: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await api.get('/admin/campaigns')
      setData(response.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (form.id) {
        await api.put(`/admin/campaigns/${form.id}`, form)
      } else {
        await api.post('/admin/campaigns', form)
      }
      alert('Campana guardada')
      setShowModal(null)
      setForm({})
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleSend = async (id) => {
    if (!confirm('Enviar esta campana ahora?')) return
    try {
      const response = await api.post(`/admin/campaigns/${id}/send`)
      alert(`Campana enviada: ${response.data.sent} exitosos, ${response.data.failed} fallidos`)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Eliminar esta campana?')) return
    try {
      await api.delete(`/admin/campaigns/${id}`)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const statusLabels = { draft: 'Borrador', scheduled: 'Programada', sending: 'Enviando', sent: 'Enviada', cancelled: 'Cancelada' }
  const audienceLabels = { 
    all: 'Todos', 
    guests: 'Clientes', 
    hosts: 'Hosts', 
    inactive: 'Inactivos', 
    new_users: 'Nuevos', 
    newsletter: 'Suscritos al Boletin',
    guests_newsletter: 'Clientes Suscritos',
    hosts_newsletter: 'Hosts Suscritos',
    custom: 'Personalizado' 
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Campanas de Email/SMS</h1>
      
      <div className="stats-grid" style={{marginBottom: '1.5rem'}}>
        <div className="stat-card card"><h4>Total</h4><p className="stat-number">{data.stats.total}</p></div>
        <div className="stat-card card"><h4>Borradores</h4><p className="stat-number">{data.stats.draft}</p></div>
        <div className="stat-card card"><h4>Programadas</h4><p className="stat-number">{data.stats.scheduled}</p></div>
        <div className="stat-card card"><h4>Enviadas</h4><p className="stat-number">{data.stats.sent}</p></div>
      </div>

      <button onClick={() => { setForm({ campaign_type: 'email', target_audience: 'all' }); setShowModal('form') }} className="btn btn-primary" style={{marginBottom: '1rem'}}>+ Nueva Campana</button>

      <table className="admin-table">
        <thead>
          <tr><th>Nombre</th><th>Tipo</th><th>Audiencia</th><th>Estado</th><th>Destinatarios</th><th>Enviados</th><th>Fecha</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {data.campaigns.map(c => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.campaign_type.toUpperCase()}</td>
              <td>{audienceLabels[c.target_audience === 'custom' && c.custom_filter ? c.custom_filter : c.target_audience] || c.target_audience}</td>
              <td><span className="badge" style={{background: c.status === 'sent' ? '#10b981' : c.status === 'draft' ? '#6b7280' : '#3b82f6'}}>{statusLabels[c.status]}</span></td>
              <td>{c.total_recipients}</td>
              <td>{c.sent_count}/{c.failed_count}</td>
              <td>{new Date(c.created_at).toLocaleDateString()}</td>
              <td>
                {c.status === 'draft' && (
                  <>
                    <button onClick={() => { 
                      const effectiveAudience = c.target_audience === 'custom' && c.custom_filter ? c.custom_filter : c.target_audience;
                      setForm({...c, target_audience: effectiveAudience}); 
                      setShowModal('form') 
                    }} className="btn btn-small" style={{marginRight: '0.25rem'}}>Editar</button>
                    <button onClick={() => handleSend(c.id)} className="btn btn-small btn-primary" style={{marginRight: '0.25rem'}}>Enviar</button>
                  </>
                )}
                <button onClick={() => handleDelete(c.id)} className="btn btn-small btn-danger">Eliminar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal === 'form' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px'}}>
            <h2>{form.id ? 'Editar' : 'Nueva'} Campana</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Nombre</label>
                <input type="text" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select value={form.campaign_type || 'email'} onChange={e => setForm({...form, campaign_type: e.target.value})}>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                  <option value="both">Ambos</option>
                </select>
              </div>
              <div className="form-group">
                <label>Audiencia</label>
                <select value={form.target_audience || 'all'} onChange={e => setForm({...form, target_audience: e.target.value})}>
                  <option value="all">Todos los Usuarios</option>
                  <option value="guests">Solo Clientes</option>
                  <option value="hosts">Solo Hosts</option>
                  <option value="new_users">Nuevos Usuarios (30 dias)</option>
                  <option value="newsletter">Suscritos al Boletin (Todos)</option>
                  <option value="guests_newsletter">Clientes Suscritos al Boletin</option>
                  <option value="hosts_newsletter">Hosts Suscritos al Boletin</option>
                </select>
                <small style={{color: '#64748b', fontSize: '12px'}}>Los usuarios suscritos al boletin han aceptado recibir correos informativos.</small>
              </div>
              {form.campaign_type !== 'sms' && (
                <div className="form-group">
                  <label>Asunto (Email)</label>
                  <input type="text" value={form.subject || ''} onChange={e => setForm({...form, subject: e.target.value})} />
                </div>
              )}
              <div className="form-group">
                <label>Contenido</label>
                <textarea value={form.content || ''} onChange={e => setForm({...form, content: e.target.value})} rows="6" required placeholder="Use {{nombre}}, {{email}} como variables..."></textarea>
              </div>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button type="submit" className="btn btn-primary">Guardar</button>
                <button type="button" onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// B: ESTADOS DE CUENTA HOSTS
// ============================================
function AdminHostStatements() {
  const [statements, setStatements] = useState([])
  const [hosts, setHosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statementsRes, hostsRes] = await Promise.all([
        api.get('/admin/host-statements'),
        api.get('/admin/panel/users?role=HOST')
      ])
      setStatements(statementsRes.data)
      setHosts(hostsRes.data.users)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async (e) => {
    e.preventDefault()
    try {
      await api.post('/admin/host-statements/generate', form)
      alert('Estado de cuenta generado')
      setShowModal(null)
      setForm({})
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleUpdateStatus = async (id, status) => {
    try {
      await api.put(`/admin/host-statements/${id}`, { payout_status: status })
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const statusLabels = { pending: 'Pendiente', processing: 'Procesando', paid: 'Pagado', failed: 'Fallido' }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Estados de Cuenta de Hosts</h1>
      
      <button onClick={() => { setForm({ period_start: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0], period_end: new Date().toISOString().split('T')[0] }); setShowModal('generate') }} className="btn btn-primary" style={{marginBottom: '1rem'}}>+ Generar Estado de Cuenta</button>

      <table className="admin-table">
        <thead>
          <tr><th>N° Estado</th><th>Host</th><th>Periodo</th><th>Reservas</th><th>Ingresos Brutos</th><th>Comision</th><th>Neto</th><th>Estado Pago</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {statements.map(s => (
            <tr key={s.id}>
              <td>{s.statement_number}</td>
              <td>{s.first_name} {s.last_name || s.company_name}</td>
              <td>{s.period_start} - {s.period_end}</td>
              <td>{s.total_bookings}</td>
              <td>Bs. {s.gross_income?.toFixed(2)}</td>
              <td>Bs. {s.commission_deducted?.toFixed(2)}</td>
              <td>Bs. {s.net_payout?.toFixed(2)}</td>
              <td><span className="badge" style={{background: s.payout_status === 'paid' ? '#10b981' : '#f59e0b'}}>{statusLabels[s.payout_status]}</span></td>
              <td>
                {s.payout_status !== 'paid' && (
                  <button onClick={() => handleUpdateStatus(s.id, 'paid')} className="btn btn-small btn-primary">Marcar Pagado</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal === 'generate' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Generar Estado de Cuenta</h2>
            <form onSubmit={handleGenerate}>
              <div className="form-group">
                <label>Host</label>
                <select value={form.host_id || ''} onChange={e => setForm({...form, host_id: e.target.value})} required>
                  <option value="">Seleccionar host...</option>
                  {hosts.map(h => <option key={h.id} value={h.id}>{h.email} ({h.first_name} {h.last_name})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Fecha Inicio</label>
                <input type="date" value={form.period_start || ''} onChange={e => setForm({...form, period_start: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Fecha Fin</label>
                <input type="date" value={form.period_end || ''} onChange={e => setForm({...form, period_end: e.target.value})} required />
              </div>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button type="submit" className="btn btn-primary">Generar</button>
                <button type="button" onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// C: DEPOSITOS DE SEGURIDAD
// ============================================
function AdminSecurityDeposits() {
  const [data, setData] = useState({ deposits: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await api.get('/admin/security-deposits')
      setData(response.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    try {
      await api.put(`/admin/security-deposits/${form.id}`, form)
      alert('Deposito actualizado')
      setShowModal(null)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const statusLabels = { pending: 'Pendiente', held: 'Retenido', partially_released: 'Liberado Parcial', released: 'Liberado', claimed: 'Reclamado', refunded: 'Reembolsado' }
  const statusColors = { pending: '#f59e0b', held: '#3b82f6', partially_released: '#8b5cf6', released: '#10b981', claimed: '#ef4444', refunded: '#6b7280' }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Depositos de Seguridad</h1>
      
      <div className="stats-grid" style={{marginBottom: '1.5rem'}}>
        <div className="stat-card card"><h4>Total</h4><p className="stat-number">{data.stats.total}</p></div>
        <div className="stat-card card"><h4>Retenidos</h4><p className="stat-number">{data.stats.held}</p></div>
        <div className="stat-card card"><h4>Monto Retenido</h4><p className="stat-number">Bs. {data.stats.total_amount_held?.toFixed(2) || '0.00'}</p></div>
      </div>

      <table className="admin-table">
        <thead>
          <tr><th>Espacio</th><th>Cliente</th><th>Host</th><th>Monto</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {data.deposits.map(d => (
            <tr key={d.id}>
              <td>{d.space_title}</td>
              <td>{d.guest_first_name} {d.guest_last_name}</td>
              <td>{d.host_first_name} {d.host_last_name}</td>
              <td>Bs. {d.amount?.toFixed(2)}</td>
              <td><span className="badge" style={{background: statusColors[d.status]}}>{statusLabels[d.status]}</span></td>
              <td>{new Date(d.created_at).toLocaleDateString()}</td>
              <td>
                {d.status === 'held' && (
                  <button onClick={() => { setForm(d); setShowModal('process') }} className="btn btn-small btn-primary">Procesar</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal === 'process' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Procesar Deposito</h2>
            <p><strong>Monto:</strong> Bs. {form.amount?.toFixed(2)}</p>
            <p><strong>Cliente:</strong> {form.guest_first_name} {form.guest_last_name}</p>
            <div className="form-group">
              <label>Accion</label>
              <select value={form.status || ''} onChange={e => setForm({...form, status: e.target.value})}>
                <option value="">Seleccionar...</option>
                <option value="released">Liberar Total</option>
                <option value="partially_released">Liberacion Parcial</option>
                <option value="claimed">Retener por Danos</option>
                <option value="refunded">Reembolsar</option>
              </select>
            </div>
            {form.status === 'partially_released' && (
              <div className="form-group">
                <label>Monto a Liberar</label>
                <input type="number" step="0.01" value={form.release_amount || ''} onChange={e => setForm({...form, release_amount: parseFloat(e.target.value)})} max={form.amount} />
              </div>
            )}
            {form.status === 'claimed' && (
              <>
                <div className="form-group">
                  <label>Monto a Retener</label>
                  <input type="number" step="0.01" value={form.claim_amount || ''} onChange={e => setForm({...form, claim_amount: parseFloat(e.target.value)})} max={form.amount} />
                </div>
                <div className="form-group">
                  <label>Razon del Reclamo</label>
                  <textarea value={form.claim_reason || ''} onChange={e => setForm({...form, claim_reason: e.target.value})} rows="3"></textarea>
                </div>
              </>
            )}
            <div className="form-group">
              <label>Notas</label>
              <textarea value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} rows="2"></textarea>
            </div>
            <div style={{display: 'flex', gap: '0.5rem'}}>
              <button onClick={handleUpdate} className="btn btn-primary">Procesar</button>
              <button onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// D: BADGES
// ============================================
function AdminBadges() {
  const [badges, setBadges] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [badgesRes, usersRes] = await Promise.all([
        api.get('/admin/badges'),
        api.get('/admin/users')
      ])
      setBadges(badgesRes.data)
      setUsers(usersRes.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    try {
      if (form.id) {
        await api.put(`/admin/badges/${form.id}`, form)
      } else {
        await api.post('/admin/badges', form)
      }
      alert('Badge guardado')
      setShowModal(null)
      setForm({})
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleAward = async (e) => {
    e.preventDefault()
    try {
      await api.post('/admin/badges/award', { user_id: form.user_id, badge_id: form.badge_id })
      alert('Badge otorgado')
      setShowModal(null)
      setForm({})
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const typeLabels = { host: 'Solo Hosts', guest: 'Solo Clientes', both: 'Ambos' }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Badges / Insignias</h1>
      
      <div style={{display: 'flex', gap: '0.5rem', marginBottom: '1rem'}}>
        <button onClick={() => { setForm({ badge_type: 'both', is_automatic: true }); setShowModal('badge') }} className="btn btn-primary">+ Nuevo Badge</button>
        <button onClick={() => { setForm({}); setShowModal('award') }} className="btn btn-secondary">Otorgar Badge</button>
      </div>

      <table className="admin-table">
        <thead>
          <tr><th>Icono</th><th>Codigo</th><th>Nombre</th><th>Descripcion</th><th>Tipo</th><th>Automatico</th><th>Otorgados</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {badges.map(b => (
            <tr key={b.id}>
              <td><span style={{fontSize: '1.5rem', color: b.color}}>⭐</span></td>
              <td><code>{b.code}</code></td>
              <td>{b.name}</td>
              <td>{b.description}</td>
              <td>{typeLabels[b.badge_type]}</td>
              <td>{b.is_automatic ? 'Si' : 'No'}</td>
              <td>{b.awarded_count}</td>
              <td><button onClick={() => { setForm(b); setShowModal('badge') }} className="btn btn-small">Editar</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {showModal === 'badge' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{form.id ? 'Editar' : 'Nuevo'} Badge</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Codigo</label>
                <input type="text" value={form.code || ''} onChange={e => setForm({...form, code: e.target.value})} required disabled={!!form.id} />
              </div>
              <div className="form-group">
                <label>Nombre</label>
                <input type="text" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Descripcion</label>
                <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} rows="2"></textarea>
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select value={form.badge_type || 'both'} onChange={e => setForm({...form, badge_type: e.target.value})}>
                  <option value="host">Solo Hosts</option>
                  <option value="guest">Solo Clientes</option>
                  <option value="both">Ambos</option>
                </select>
              </div>
              <div className="form-group">
                <label>Color</label>
                <input type="color" value={form.color || '#4F46E5'} onChange={e => setForm({...form, color: e.target.value})} />
              </div>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button type="submit" className="btn btn-primary">Guardar</button>
                <button type="button" onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal === 'award' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Otorgar Badge</h2>
            <form onSubmit={handleAward}>
              <div className="form-group">
                <label>Usuario</label>
                <select value={form.user_id || ''} onChange={e => setForm({...form, user_id: e.target.value})} required>
                  <option value="">Seleccionar usuario...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.email} ({u.first_name} {u.last_name})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Badge</label>
                <select value={form.badge_id || ''} onChange={e => setForm({...form, badge_id: e.target.value})} required>
                  <option value="">Seleccionar badge...</option>
                  {badges.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button type="submit" className="btn btn-primary">Otorgar</button>
                <button type="button" onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// E: FAQ
// ============================================
function AdminFAQ() {
  const [categories, setCategories] = useState([])
  const [faqs, setFaqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('faqs')
  const [showModal, setShowModal] = useState(null)
  const [form, setForm] = useState({})

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [catsRes, faqsRes] = await Promise.all([
        api.get('/admin/faq-categories'),
        api.get('/admin/faqs')
      ])
      setCategories(catsRes.data)
      setFaqs(faqsRes.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCategory = async (e) => {
    e.preventDefault()
    try {
      await api.post('/admin/faq-categories', form)
      alert('Categoria creada')
      setShowModal(null)
      setForm({})
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleSaveFAQ = async (e) => {
    e.preventDefault()
    try {
      if (form.id) {
        await api.put(`/admin/faqs/${form.id}`, form)
      } else {
        await api.post('/admin/faqs', form)
      }
      alert('FAQ guardada')
      setShowModal(null)
      setForm({})
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleDeleteFAQ = async (id) => {
    if (!confirm('Eliminar esta FAQ?')) return
    try {
      await api.delete(`/admin/faqs/${id}`)
      loadData()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Centro de Ayuda / FAQ</h1>
      
      <div style={{marginBottom: '1rem'}}>
        <button onClick={() => setActiveTab('faqs')} className={`btn ${activeTab === 'faqs' ? 'btn-primary' : 'btn-secondary'}`} style={{marginRight: '0.5rem'}}>Preguntas</button>
        <button onClick={() => setActiveTab('categories')} className={`btn ${activeTab === 'categories' ? 'btn-primary' : 'btn-secondary'}`}>Categorias</button>
      </div>

      {activeTab === 'faqs' && (
        <div>
          <button onClick={() => { setForm({ is_active: true }); setShowModal('faq') }} className="btn btn-primary" style={{marginBottom: '1rem'}}>+ Nueva Pregunta</button>
          <table className="admin-table">
            <thead>
              <tr><th>Categoria</th><th>Pregunta</th><th>Vistas</th><th>Util</th><th>Activa</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {faqs.map(f => (
                <tr key={f.id}>
                  <td>{f.category_name}</td>
                  <td>{f.question}</td>
                  <td>{f.views}</td>
                  <td>{f.helpful_yes} / {f.helpful_no}</td>
                  <td>{f.is_active ? 'Si' : 'No'}</td>
                  <td>
                    <button onClick={() => { setForm(f); setShowModal('faq') }} className="btn btn-small" style={{marginRight: '0.25rem'}}>Editar</button>
                    <button onClick={() => handleDeleteFAQ(f.id)} className="btn btn-small btn-danger">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'categories' && (
        <div>
          <button onClick={() => { setForm({}); setShowModal('category') }} className="btn btn-primary" style={{marginBottom: '1rem'}}>+ Nueva Categoria</button>
          <table className="admin-table">
            <thead>
              <tr><th>Nombre</th><th>Slug</th><th>Descripcion</th><th>Preguntas</th><th>Audiencia</th></tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td><code>{c.slug}</code></td>
                  <td>{c.description}</td>
                  <td>{c.faqs_count}</td>
                  <td>{c.target_audience}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal === 'faq' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '600px'}}>
            <h2>{form.id ? 'Editar' : 'Nueva'} Pregunta</h2>
            <form onSubmit={handleSaveFAQ}>
              <div className="form-group">
                <label>Categoria</label>
                <select value={form.category_id || ''} onChange={e => setForm({...form, category_id: e.target.value})} required>
                  <option value="">Seleccionar...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Pregunta</label>
                <input type="text" value={form.question || ''} onChange={e => setForm({...form, question: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Respuesta</label>
                <textarea value={form.answer || ''} onChange={e => setForm({...form, answer: e.target.value})} rows="6" required></textarea>
              </div>
              <div className="form-group">
                <label><input type="checkbox" checked={form.is_featured || false} onChange={e => setForm({...form, is_featured: e.target.checked})} /> Destacada</label>
              </div>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button type="submit" className="btn btn-primary">Guardar</button>
                <button type="button" onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal === 'category' && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>Nueva Categoria</h2>
            <form onSubmit={handleSaveCategory}>
              <div className="form-group">
                <label>Nombre</label>
                <input type="text" value={form.name || ''} onChange={e => setForm({...form, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})} required />
              </div>
              <div className="form-group">
                <label>Slug</label>
                <input type="text" value={form.slug || ''} onChange={e => setForm({...form, slug: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Descripcion</label>
                <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} rows="2"></textarea>
              </div>
              <div className="form-group">
                <label>Audiencia</label>
                <select value={form.target_audience || 'all'} onChange={e => setForm({...form, target_audience: e.target.value})}>
                  <option value="all">Todos</option>
                  <option value="guests">Solo Clientes</option>
                  <option value="hosts">Solo Hosts</option>
                </select>
              </div>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <button type="submit" className="btn btn-primary">Crear</button>
                <button type="button" onClick={() => setShowModal(null)} className="btn btn-secondary">Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================
// F: ALERTAS ADMIN
// ============================================
function AdminAlerts() {
  const [data, setData] = useState({ alerts: [], unread_count: 0 })
  const [loading, setLoading] = useState(true)
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)

  useEffect(() => { loadData() }, [showUnreadOnly])

  const loadData = async () => {
    setLoading(true)
    try {
      const url = showUnreadOnly ? '/admin/alerts?unread_only=true' : '/admin/alerts'
      const response = await api.get(url)
      setData(response.data)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkRead = async (id) => {
    try {
      await api.put(`/admin/alerts/${id}/read`)
      loadData()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.put('/admin/alerts/read-all')
      loadData()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const handleDismiss = async (id) => {
    try {
      await api.put(`/admin/alerts/${id}/dismiss`)
      loadData()
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const severityColors = { info: '#3b82f6', warning: '#f59e0b', error: '#ef4444', success: '#10b981' }
  const typeLabels = { payment_pending: 'Pago Pendiente', dispute_new: 'Nueva Disputa', host_verification: 'Verificacion', contract_expiring: 'Contrato por Vencer', low_activity: 'Baja Actividad', system: 'Sistema', custom: 'Personalizada' }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
        <h1>Alertas ({data.unread_count} sin leer)</h1>
        <div>
          <label style={{marginRight: '1rem'}}><input type="checkbox" checked={showUnreadOnly} onChange={e => setShowUnreadOnly(e.target.checked)} /> Solo no leidas</label>
          <button onClick={handleMarkAllRead} className="btn btn-secondary">Marcar todas como leidas</button>
        </div>
      </div>

      <div style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
        {data.alerts.map(a => (
          <div key={a.id} className="card" style={{padding: '1rem', borderLeft: `4px solid ${severityColors[a.severity]}`, opacity: a.is_read ? 0.7 : 1}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
              <div>
                <span className="badge" style={{background: severityColors[a.severity], marginRight: '0.5rem'}}>{typeLabels[a.alert_type]}</span>
                <strong>{a.title}</strong>
                <p style={{margin: '0.5rem 0', color: '#666'}}>{a.message}</p>
                <small style={{color: '#999'}}>{new Date(a.created_at).toLocaleString()}</small>
              </div>
              <div style={{display: 'flex', gap: '0.25rem'}}>
                {!a.is_read && <button onClick={() => handleMarkRead(a.id)} className="btn btn-small">Leida</button>}
                <button onClick={() => handleDismiss(a.id)} className="btn btn-small btn-danger">X</button>
              </div>
            </div>
          </div>
        ))}
        {data.alerts.length === 0 && <p style={{textAlign: 'center', color: '#666', padding: '2rem'}}>No hay alertas</p>}
      </div>
    </div>
  )
}

function AdminBackup() {
  const [config, setConfig] = useState(null)
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [configRes, backupsRes] = await Promise.all([
        api.get('/backup/config'),
        api.get('/backup/list')
      ])
      setConfig(configRes.data)
      setBackups(backupsRes.data)
    } catch (error) {
      console.error('Error loading backup data:', error)
      setMessage({ type: 'error', text: 'Error al cargar datos de backup' })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBackup = async () => {
    setCreating(true)
    setMessage(null)
    try {
      const response = await api.post('/backup/create')
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Backup creado exitosamente' })
        loadData()
      } else {
        setMessage({ type: 'error', text: response.data.error || 'Error al crear backup' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Error al crear backup' })
    } finally {
      setCreating(false)
    }
  }

  const handleUpdateConfig = async (newConfig) => {
    try {
      const response = await api.put('/backup/config', newConfig)
      if (response.data.success) {
        setConfig(response.data.config)
        setMessage({ type: 'success', text: 'Configuracion actualizada' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al actualizar configuracion' })
    }
  }

  const handleRestore = async (backupId) => {
    if (!window.confirm('ADVERTENCIA: Restaurar este backup reemplazara TODOS los datos actuales. Esta seguro de continuar?')) {
      return
    }
    if (!window.confirm('SEGUNDA CONFIRMACION: Esta accion es irreversible. Se creara un backup de seguridad antes de restaurar. Confirma?')) {
      return
    }

    setRestoring(backupId)
    setMessage(null)
    try {
      const response = await api.post(`/backup/restore/${backupId}`)
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Backup restaurado. Recargando pagina...' })
        setTimeout(() => window.location.reload(), 3000)
      } else {
        setMessage({ type: 'error', text: response.data.error || 'Error al restaurar' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Error al restaurar backup' })
    } finally {
      setRestoring(null)
    }
  }

  const handleDelete = async (backupId) => {
    if (!window.confirm('Eliminar este backup permanentemente?')) return
    
    try {
      await api.delete(`/backup/${backupId}`)
      setMessage({ type: 'success', text: 'Backup eliminado' })
      loadData()
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al eliminar backup' })
    }
  }

  const handleDownload = (backupId) => {
    window.open(`/api/backup/download/${backupId}`, '_blank')
  }

  const frequencyLabels = {
    daily: 'Diario',
    weekly: 'Semanal',
    monthly: 'Mensual',
    quarterly: 'Trimestral',
    semestral: 'Semestral',
    yearly: 'Anual'
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Backup y Recuperacion</h1>
      <p style={{color: '#666', marginBottom: '1.5rem'}}>
        Sistema de respaldo y recuperacion de datos. Solo accesible para Super Administradores.
      </p>

      {message && (
        <div className={`alert alert-${message.type}`} style={{
          padding: '1rem',
          marginBottom: '1rem',
          borderRadius: '8px',
          background: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24'
        }}>
          {message.text}
        </div>
      )}

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem'}}>
        <div className="card" style={{padding: '1.5rem'}}>
          <h3 style={{marginBottom: '1rem'}}>Backup Manual</h3>
          <p style={{color: '#666', marginBottom: '1rem'}}>
            Crea un respaldo inmediato de toda la base de datos.
          </p>
          <button 
            onClick={handleCreateBackup} 
            disabled={creating}
            className="btn btn-primary"
            style={{width: '100%'}}
          >
            {creating ? 'Creando backup...' : 'Crear Backup Ahora'}
          </button>
          {config?.last_backup_at && (
            <p style={{marginTop: '1rem', fontSize: '0.9rem', color: '#666'}}>
              Ultimo backup: {new Date(config.last_backup_at).toLocaleString()}
            </p>
          )}
        </div>

        <div className="card" style={{padding: '1.5rem'}}>
          <h3 style={{marginBottom: '1rem'}}>Backup Automatico</h3>
          <div style={{marginBottom: '1rem'}}>
            <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
              <input 
                type="checkbox" 
                checked={config?.auto_backup_enabled || false}
                onChange={(e) => handleUpdateConfig({...config, auto_backup_enabled: e.target.checked})}
              />
              <strong>Activar backups automaticos</strong>
            </label>
          </div>

          {config?.auto_backup_enabled && (
            <>
              <div style={{marginBottom: '1rem'}}>
                <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 500}}>Frecuencia:</label>
                <select 
                  value={config?.frequency || 'daily'}
                  onChange={(e) => handleUpdateConfig({...config, frequency: e.target.value})}
                  className="form-control"
                >
                  {Object.entries(frequencyLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div style={{marginBottom: '1rem'}}>
                <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: 500}}>
                  Dias de retencion: {config?.retention_days || 30}
                </label>
                <input 
                  type="range"
                  min="7"
                  max="365"
                  value={config?.retention_days || 30}
                  onChange={(e) => handleUpdateConfig({...config, retention_days: parseInt(e.target.value)})}
                  style={{width: '100%'}}
                />
                <small style={{color: '#666'}}>Los backups mas antiguos se eliminaran automaticamente</small>
              </div>

              {config?.next_backup_at && (
                <p style={{fontSize: '0.9rem', color: '#666'}}>
                  Proximo backup: {new Date(config.next_backup_at).toLocaleString()}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card" style={{padding: '1.5rem', marginBottom: '2rem'}}>
        <h3 style={{marginBottom: '1rem'}}>Notificaciones</h3>
        <div style={{display: 'flex', gap: '2rem'}}>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
            <input 
              type="checkbox" 
              checked={config?.notify_on_success || false}
              onChange={(e) => handleUpdateConfig({...config, notify_on_success: e.target.checked})}
            />
            Notificar backup exitoso
          </label>
          <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
            <input 
              type="checkbox" 
              checked={config?.notify_on_failure || false}
              onChange={(e) => handleUpdateConfig({...config, notify_on_failure: e.target.checked})}
            />
            Notificar error en backup
          </label>
        </div>
      </div>

      <div className="card" style={{padding: '1.5rem'}}>
        <h3 style={{marginBottom: '1rem'}}>Historial de Backups</h3>
        
        {backups.length === 0 ? (
          <p style={{textAlign: 'center', color: '#666', padding: '2rem'}}>
            No hay backups registrados. Crea tu primer backup manual.
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Archivo</th>
                  <th>Tamano</th>
                  <th>Estado</th>
                  <th>Creado por</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {backups.map(backup => (
                  <tr key={backup.id}>
                    <td>{new Date(backup.created_at).toLocaleString()}</td>
                    <td>
                      <span className={`badge ${backup.backup_type === 'automatic' ? 'badge-info' : 'badge-primary'}`}>
                        {backup.backup_type === 'automatic' ? 'Automatico' : 'Manual'}
                      </span>
                    </td>
                    <td style={{fontFamily: 'monospace', fontSize: '0.85rem'}}>{backup.filename}</td>
                    <td>{backup.sizeFormatted || '-'}</td>
                    <td>
                      <span className={`badge ${
                        backup.status === 'completed' ? 'badge-success' : 
                        backup.status === 'failed' ? 'badge-danger' : 'badge-warning'
                      }`}>
                        {backup.status === 'completed' ? 'Completado' : 
                         backup.status === 'failed' ? 'Fallido' : 'En progreso'}
                      </span>
                      {!backup.exists && backup.status === 'completed' && (
                        <span className="badge badge-warning" style={{marginLeft: '0.25rem'}}>Archivo no encontrado</span>
                      )}
                    </td>
                    <td>
                      {backup.created_by_email ? (
                        <span title={backup.created_by_email}>
                          {backup.first_name} {backup.last_name}
                        </span>
                      ) : (
                        <span style={{color: '#666'}}>Sistema</span>
                      )}
                    </td>
                    <td>
                      <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center'}}>
                        {backup.status === 'completed' && backup.exists && (
                          <button 
                            onClick={() => handleRestore(backup.id)}
                            disabled={restoring === backup.id}
                            className="btn btn-small"
                            style={{
                              background: '#28a745',
                              color: 'white',
                              fontWeight: 'bold',
                              padding: '0.5rem 1rem',
                              border: 'none',
                              borderRadius: '4px'
                            }}
                            title="Recuperar datos desde este backup"
                          >
                            {restoring === backup.id ? 'Recuperando...' : 'RECOVERY'}
                          </button>
                        )}
                        {backup.status === 'completed' && backup.exists && (
                          <button 
                            onClick={() => handleDownload(backup.id)}
                            className="btn btn-small btn-secondary"
                            title="Descargar backup"
                          >
                            Descargar
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(backup.id)}
                          className="btn btn-small btn-danger"
                          title="Eliminar backup"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard
