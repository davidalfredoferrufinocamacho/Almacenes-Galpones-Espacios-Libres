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

const authApi = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

authApi.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function OwnerDashboard() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [showAntiBypass, setShowAntiBypass] = useState(false)
  const [antiBypassData, setAntiBypassData] = useState(null)
  const [antiBypassAccepting, setAntiBypassAccepting] = useState(false)
  const [ownerName, setOwnerName] = useState('')

  useEffect(() => {
    checkAntiBypass()
    loadOwnerName()
  }, [])

  const loadOwnerName = async () => {
    try {
      const res = await api.get('/profile')
      const fullName = [res.data.first_name, res.data.last_name].filter(Boolean).join(' ')
      setOwnerName(fullName || '')
    } catch (error) {
      console.error('Error loading owner name:', error)
    }
  }

  const checkAntiBypass = async () => {
    try {
      const res = await api.get('/profile')
      if (!res.data.anti_bypass_accepted) {
        const legalRes = await authApi.get('/legal/texts?category=anti_bypass')
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
      await authApi.put('/users/me/accept-anti-bypass')
      setShowAntiBypass(false)
      window.location.reload()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setAntiBypassAccepting(false)
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'appointments', label: 'Citas', icon: '📅' },
    { id: 'contracts', label: 'Contratos', icon: '📝' },
    { id: 'spaces', label: 'Espacios', icon: '🏢' },
    { id: 'invoices', label: 'Facturas', icon: '🧾' },
    { id: 'income', label: 'Ingresos', icon: '💵' },
    { id: 'payments', label: 'Pagos', icon: '💰' },
    { id: 'reservations', label: 'Reservaciones', icon: '📋' }
  ]

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard': return <OwnerHome />
      case 'appointments': return <OwnerAppointments />
      case 'contracts': return <OwnerContracts />
      case 'spaces': return <OwnerSpaces />
      case 'invoices': return <OwnerInvoices />
      case 'income': return <OwnerIncome />
      case 'profile': return <OwnerProfile />
      case 'payments': return <OwnerPayments />
      case 'reservations': return <OwnerReservations />
      default: return <OwnerHome />
    }
  }

  return (
    <div className="owner-dashboard">
      {showAntiBypass && (
        <div className="modal-overlay">
          <div className="modal anti-bypass-modal">
            <div className="modal-header">
              <h2>Clausula Anti-Bypass</h2>
            </div>
            <div className="modal-body">
              <p className="anti-bypass-intro">
                Para continuar utilizando la plataforma como propietario, debe aceptar los terminos de nuestra clausula anti-bypass que protege las transacciones realizadas a traves de nuestra plataforma.
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

      <aside className="owner-sidebar">
        <div className="owner-sidebar-header">
          <h2>Portal del Propietario</h2>
          {ownerName && <p className="owner-name">{ownerName}</p>}
          <button 
            className={`profile-btn ${activeSection === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveSection('profile')}
          >
            <span>👤</span> Mi Perfil
          </button>
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
          <h3>Citas Pendientes</h3>
          <div className="stat-value">{data.appointments?.pending || 0}</div>
          <div className="stat-detail">
            {data.appointments?.total || 0} citas totales
          </div>
        </div>
        <div className="stat-card">
          <h3>Contratos</h3>
          <div className="stat-value">{data.contracts?.total || 0}</div>
          <div className="stat-detail">
            {data.contracts?.active || 0} activos
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
          <h3>Mis Espacios</h3>
          <div className="stat-value">{data.spaces?.total || 0}</div>
          <div className="stat-detail">
            {data.spaces?.published || 0} publicados
          </div>
        </div>
        <div className="stat-card">
          <h3>Pagos</h3>
          <div className="stat-value">{data.payments?.total || 0}</div>
          <div className="stat-detail">
            Pagos recibidos
          </div>
        </div>
        <div className="stat-card">
          <h3>Reservaciones</h3>
          <div className="stat-value">{data.reservations?.total || 0}</div>
          <div className="stat-detail">
            {data.reservations?.active || 0} activas
          </div>
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
    </div>
  )
}

function OwnerSpaces() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [photos, setPhotos] = useState([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)

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
        alert('Espacio actualizado exitosamente')
      } else {
        await api.post('/spaces', form)
        alert('Espacio creado exitosamente')
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
      const res = await authApi.get(`/spaces/${id}`)
      setForm(res.data)
      setPhotos(res.data.photos || [])
      setShowModal(true)
    } catch (error) {
      alert('Error al cargar espacio')
    }
  }

  const handleUploadPhotos = async (e) => {
    if (!form.id) {
      alert('Primero guarde el espacio, luego podra subir fotos')
      return
    }
    const files = e.target.files
    if (!files.length) return
    
    setUploadingPhotos(true)
    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('photos', files[i])
    }
    
    try {
      const res = await authApi.post(`/spaces/${form.id}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setPhotos(res.data.photos || [])
      alert('Fotos subidas exitosamente')
    } catch (error) {
      alert('Error al subir fotos: ' + (error.response?.data?.error || error.message))
    }
    setUploadingPhotos(false)
    e.target.value = ''
  }

  const handleDeletePhoto = async (photoId) => {
    if (!confirm('¿Eliminar esta foto?')) return
    try {
      const res = await authApi.delete(`/spaces/${form.id}/photos/${photoId}`)
      setPhotos(res.data.photos || [])
    } catch (error) {
      alert('Error al eliminar foto: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleUploadVideo = async (e) => {
    if (!form.id) {
      alert('Primero guarde el espacio, luego podra subir video')
      return
    }
    const file = e.target.files[0]
    if (!file) return
    
    setUploadingVideo(true)
    const formData = new FormData()
    formData.append('video', file)
    
    try {
      const res = await authApi.post(`/spaces/${form.id}/video`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setForm({...form, video_url: res.data.video_url, video_duration: res.data.duration})
      alert(`Video subido exitosamente (${res.data.duration} segundos)`)
    } catch (error) {
      alert('Error al subir video: ' + (error.response?.data?.error || error.message))
    }
    setUploadingVideo(false)
    e.target.value = ''
  }

  const handleDeleteVideo = async () => {
    if (!confirm('¿Eliminar el video?')) return
    try {
      await authApi.delete(`/spaces/${form.id}/video`)
      setForm({...form, video_url: null, video_duration: null})
    } catch (error) {
      alert('Error al eliminar video: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Estas seguro de eliminar este espacio? Esta accion no se puede deshacer.')) return
    setDeleting(id)
    try {
      await api.delete(`/spaces/${id}`)
      alert('Espacio eliminado exitosamente')
      loadSpaces()
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setDeleting(null)
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <div className="section-header">
        <h1>Mis Espacios</h1>
        <button onClick={() => { setForm({}); setPhotos([]); setShowModal(true) }} className="btn btn-primary">+ Nuevo Espacio</button>
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
                <p><strong>Ciudad:</strong> {s.city}, {s.department}</p>
                <p><strong>Direccion:</strong> {s.address}</p>
                <p><strong>Area Total:</strong> {s.total_sqm} m2</p>
                <p><strong>Area Disponible:</strong> {s.available_sqm} m2</p>
                {s.price_per_sqm_day && <p><strong>Precio/dia:</strong> Bs. {s.price_per_sqm_day}/m2</p>}
                {s.price_per_sqm_week && <p><strong>Precio/semana:</strong> Bs. {s.price_per_sqm_week}/m2</p>}
                {s.price_per_sqm_month && <p><strong>Precio/mes:</strong> Bs. {s.price_per_sqm_month}/m2</p>}
                {s.price_per_sqm_quarter && <p><strong>Precio/trimestre:</strong> Bs. {s.price_per_sqm_quarter}/m2</p>}
                {s.price_per_sqm_semester && <p><strong>Precio/semestre:</strong> Bs. {s.price_per_sqm_semester}/m2</p>}
                {s.price_per_sqm_year && <p><strong>Precio/año:</strong> Bs. {s.price_per_sqm_year}/m2</p>}
                <p><strong>Dias min/max:</strong> {s.min_rental_days || 1} / {s.max_rental_days || 'Sin limite'}</p>
                <p><strong>Condiciones:</strong> {s.has_roof ? 'Con techo' : 'Sin techo'}, {s.has_security ? 'Con seguridad' : 'Sin seguridad'}</p>
              </div>
              <div className="space-card-actions">
                <button onClick={() => handleEdit(s.id)} className="btn btn-small">Editar</button>
                {s.status === 'draft' ? (
                  <button onClick={() => handlePublish(s.id)} className="btn btn-small btn-success">Publicar</button>
                ) : (
                  <button onClick={() => handleUnpublish(s.id)} className="btn btn-small btn-warning">Despublicar</button>
                )}
                <button onClick={() => handleDelete(s.id)} className="btn btn-small btn-danger" disabled={deleting === s.id}>
                  {deleting === s.id ? 'Eliminando...' : 'Eliminar'}
                </button>
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
                  <select value={form.space_type || 'almacen'} onChange={e => setForm({...form, space_type: e.target.value})}>
                    <option value="almacen">Almacen</option>
                    <option value="galpon">Galpon</option>
                    <option value="deposito">Deposito</option>
                    <option value="cuarto">Cuarto</option>
                    <option value="contenedor">Contenedor</option>
                    <option value="patio">Patio</option>
                    <option value="terreno">Terreno</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Descripcion *</label>
                <textarea value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} rows="3" required></textarea>
              </div>

              <h4>Area</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>m2 Totales *</label>
                  <input type="number" value={form.total_sqm || ''} onChange={e => setForm({...form, total_sqm: e.target.value})} required min="1" />
                </div>
                <div className="form-group">
                  <label>m2 Disponibles *</label>
                  <input type="number" value={form.available_sqm || ''} onChange={e => setForm({...form, available_sqm: e.target.value})} required min="1" />
                </div>
              </div>

              <h4>Precios por m2 (Bs.)</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Por Dia</label>
                  <input type="number" step="0.01" value={form.price_per_sqm_day || ''} onChange={e => setForm({...form, price_per_sqm_day: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Por Semana</label>
                  <input type="number" step="0.01" value={form.price_per_sqm_week || ''} onChange={e => setForm({...form, price_per_sqm_week: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Por Mes</label>
                  <input type="number" step="0.01" value={form.price_per_sqm_month || ''} onChange={e => setForm({...form, price_per_sqm_month: e.target.value})} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Por Trimestre</label>
                  <input type="number" step="0.01" value={form.price_per_sqm_quarter || ''} onChange={e => setForm({...form, price_per_sqm_quarter: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Por Semestre</label>
                  <input type="number" step="0.01" value={form.price_per_sqm_semester || ''} onChange={e => setForm({...form, price_per_sqm_semester: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Por Año</label>
                  <input type="number" step="0.01" value={form.price_per_sqm_year || ''} onChange={e => setForm({...form, price_per_sqm_year: e.target.value})} />
                </div>
              </div>

              <h4>Ubicacion</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Ciudad *</label>
                  <input type="text" value={form.city || ''} onChange={e => setForm({...form, city: e.target.value})} required />
                </div>
                <div className="form-group">
                  <label>Departamento *</label>
                  <select value={form.department || ''} onChange={e => setForm({...form, department: e.target.value})} required>
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
              <div className="form-group">
                <label>Direccion *</label>
                <input type="text" value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} required />
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

              <h4>Condiciones del Espacio</h4>
              <div className="form-row checkbox-row">
                <label><input type="checkbox" checked={form.is_open || false} onChange={e => setForm({...form, is_open: e.target.checked})} /> Espacio abierto</label>
                <label><input type="checkbox" checked={form.has_roof !== false && form.has_roof !== 0} onChange={e => setForm({...form, has_roof: e.target.checked})} /> Con techo</label>
                <label><input type="checkbox" checked={form.rain_protected !== false && form.rain_protected !== 0} onChange={e => setForm({...form, rain_protected: e.target.checked})} /> Protegido lluvia</label>
                <label><input type="checkbox" checked={form.dust_protected !== false && form.dust_protected !== 0} onChange={e => setForm({...form, dust_protected: e.target.checked})} /> Protegido polvo</label>
                <label><input type="checkbox" checked={form.has_security || false} onChange={e => setForm({...form, has_security: e.target.checked})} /> Con seguridad</label>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Tipo de Acceso</label>
                  <select value={form.access_type || 'controlado'} onChange={e => setForm({...form, access_type: e.target.value})}>
                    <option value="libre">Libre</option>
                    <option value="controlado">Controlado</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Horarios</label>
                  <input type="text" value={form.schedule || ''} onChange={e => setForm({...form, schedule: e.target.value})} placeholder="Lun-Vie 8:00-18:00" />
                </div>
              </div>
              {(form.has_security || form.has_security === 1) && (
                <div className="form-group">
                  <label>Descripcion de Seguridad</label>
                  <input type="text" value={form.security_description || ''} onChange={e => setForm({...form, security_description: e.target.value})} placeholder="Vigilancia 24h, camaras, etc." />
                </div>
              )}

              <h4>Dias de Alquiler</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Minimo Dias</label>
                  <input type="number" min="1" value={form.min_rental_days || ''} onChange={e => setForm({...form, min_rental_days: e.target.value})} placeholder="1" />
                </div>
                <div className="form-group">
                  <label>Maximo Dias</label>
                  <input type="number" min="1" value={form.max_rental_days || ''} onChange={e => setForm({...form, max_rental_days: e.target.value})} placeholder="Sin limite" />
                </div>
              </div>

              <h4>Disponibilidad</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Disponible Desde</label>
                  <input type="date" value={form.available_from || ''} onChange={e => setForm({...form, available_from: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Disponible Hasta</label>
                  <input type="date" value={form.available_until || ''} onChange={e => setForm({...form, available_until: e.target.value})} />
                </div>
              </div>

              {form.id && (
                <>
                  <h4>Fotos del Espacio</h4>
                  <div className="media-section">
                    <div className="photos-grid">
                      {photos.map(photo => (
                        <div key={photo.id} className="photo-item">
                          <img src={photo.url} alt="Foto del espacio" />
                          <button type="button" className="btn-delete-photo" onClick={() => handleDeletePhoto(photo.id)}>✕</button>
                        </div>
                      ))}
                    </div>
                    <div className="upload-area">
                      <label className="btn btn-secondary">
                        {uploadingPhotos ? 'Subiendo...' : '+ Agregar Fotos'}
                        <input type="file" accept="image/*" multiple onChange={handleUploadPhotos} disabled={uploadingPhotos} style={{display: 'none'}} />
                      </label>
                      <span className="upload-hint">Maximo 10 fotos por vez</span>
                    </div>
                  </div>

                  <h4>Video del Espacio</h4>
                  <div className="media-section">
                    {form.video_url ? (
                      <div className="video-preview">
                        <video src={form.video_url} controls width="100%" style={{maxHeight: '200px'}} />
                        <p>Duracion: {form.video_duration} segundos</p>
                        <button type="button" className="btn btn-danger btn-small" onClick={handleDeleteVideo}>Eliminar Video</button>
                      </div>
                    ) : (
                      <div className="upload-area">
                        <label className="btn btn-secondary">
                          {uploadingVideo ? 'Subiendo...' : '+ Subir Video'}
                          <input type="file" accept="video/*" onChange={handleUploadVideo} disabled={uploadingVideo} style={{display: 'none'}} />
                        </label>
                        <span className="upload-hint">Duracion entre 0-15 segundos (configurable por Admin)</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!form.id && (
                <div className="info-box">
                  <p>Guarde el espacio primero para poder subir fotos y video.</p>
                </div>
              )}

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
      <h1>Pagos</h1>

      <div className="owner-stats-grid" style={{marginBottom: '1.5rem'}}>
        <div className="stat-card">
          <h3>Total Pagado</h3>
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

function OwnerAppointments() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/appointments').then(res => {
      setAppointments(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleStatusChange = async (id, status) => {
    try {
      await api.put(`/appointments/${id}`, { status })
      setAppointments(appointments.map(a => a.id === id ? { ...a, status } : a))
    } catch (error) {
      alert('Error al actualizar cita')
    }
  }

  const statusLabels = {
    solicitada: 'Solicitada',
    aceptada: 'Aceptada',
    rechazada: 'Rechazada',
    reprogramada: 'Reprogramada',
    realizada: 'Realizada',
    no_asistida: 'No Asistida'
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Citas</h1>
      
      {appointments.length > 0 ? (
        <table className="owner-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Espacio</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map(a => (
              <tr key={a.id}>
                <td>{new Date(a.scheduled_date).toLocaleDateString()}</td>
                <td>{a.scheduled_time}</td>
                <td>{a.space_title}</td>
                <td>{a.guest_name}</td>
                <td><span className={`status-badge status-${a.status}`}>{statusLabels[a.status] || a.status}</span></td>
                <td>
                  {a.status === 'solicitada' && (
                    <>
                      <button onClick={() => handleStatusChange(a.id, 'aceptada')} className="btn btn-small btn-success">Aceptar</button>
                      <button onClick={() => handleStatusChange(a.id, 'rechazada')} className="btn btn-small btn-danger" style={{marginLeft: '0.5rem'}}>Rechazar</button>
                    </>
                  )}
                  {a.status === 'aceptada' && (
                    <button onClick={() => handleStatusChange(a.id, 'realizada')} className="btn btn-small btn-primary">Marcar Realizada</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay citas registradas</p>
        </div>
      )}
    </div>
  )
}

function OwnerContracts() {
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/contracts').then(res => {
      setContracts(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const statusLabels = {
    draft: 'Borrador',
    pending: 'Pendiente',
    active: 'Activo',
    completed: 'Completado',
    cancelled: 'Cancelado'
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Contratos</h1>
      
      {contracts.length > 0 ? (
        <table className="owner-table">
          <thead>
            <tr>
              <th>Numero</th>
              <th>Espacio</th>
              <th>Cliente</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Monto</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map(c => (
              <tr key={c.id}>
                <td>{c.contract_number || c.id.substring(0, 8)}</td>
                <td>{c.space_title}</td>
                <td>{c.guest_name}</td>
                <td>{new Date(c.start_date).toLocaleDateString()}</td>
                <td>{new Date(c.end_date).toLocaleDateString()}</td>
                <td>Bs. {c.total_amount?.toLocaleString()}</td>
                <td><span className={`status-badge status-${c.status}`}>{statusLabels[c.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <p>No hay contratos registrados</p>
        </div>
      )}
    </div>
  )
}

function OwnerIncome() {
  const [data, setData] = useState({ income: [], summary: {} })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/income').then(res => {
      setData(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Ingresos</h1>
      
      <div className="owner-stats-grid">
        <div className="stat-card">
          <h3>Total Ingresos</h3>
          <div className="stat-value">Bs. {(data.summary?.total || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>En Deposito</h3>
          <div className="stat-value">Bs. {(data.summary?.in_escrow || 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Liberado</h3>
          <div className="stat-value">Bs. {(data.summary?.released || 0).toLocaleString()}</div>
        </div>
      </div>

      {data.income?.length > 0 ? (
        <div className="owner-section" style={{marginTop: '1.5rem'}}>
          <h2>Historial de Ingresos</h2>
          <table className="owner-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Espacio</th>
                <th>Cliente</th>
                <th>Concepto</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.income.map(i => (
                <tr key={i.id}>
                  <td>{new Date(i.created_at).toLocaleDateString()}</td>
                  <td>{i.space_title}</td>
                  <td>{i.guest_name}</td>
                  <td>{i.concept}</td>
                  <td>Bs. {i.amount?.toLocaleString()}</td>
                  <td><span className={`status-badge status-${i.status}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>No hay ingresos registrados</p>
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
    api.get('/profile').then(res => {
      setProfile(res.data)
      setForm(res.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put('/profile', {
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
      const res = await api.post('/profile/photo', formData, {
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
      await api.delete('/profile/photo')
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
      await api.put('/profile/password', passwordForm)
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
      await authApi.post('/auth/resend-verification')
      alert('Correo de verificacion enviado. Revisa tu bandeja de entrada.')
    } catch (error) {
      alert('Error: ' + (error.response?.data?.error || error.message))
    }
    setResendingVerification(false)
  }

  const handleDeleteAccount = async () => {
    const confirmText = prompt('Para eliminar su cuenta permanentemente, escriba "ELIMINAR MI CUENTA":')
    if (confirmText !== 'ELIMINAR MI CUENTA') {
      alert('La confirmacion no coincide. La cuenta no fue eliminada.')
      return
    }

    setDeletingAccount(true)
    try {
      await api.delete('/account')
      alert('Su cuenta ha sido eliminada permanentemente.')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/'
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
              <label>NIT</label>
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

function OwnerInvoices() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInvoices()
  }, [])

  const loadInvoices = async () => {
    try {
      const res = await api.get('/invoices')
      setInvoices(res.data || [])
    } catch (error) {
      console.error('Error loading invoices:', error)
    }
    setLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner"></div></div>

  return (
    <div>
      <h1>Facturas</h1>

      {invoices.length === 0 ? (
        <div className="empty-state">
          <p>No tienes facturas generadas.</p>
          <p>Las facturas se generan automaticamente cuando recibes pagos por tus espacios.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Numero</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Espacio</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number || invoice.id}</td>
                  <td>{new Date(invoice.created_at).toLocaleDateString()}</td>
                  <td>{invoice.guest_name || 'N/A'}</td>
                  <td>{invoice.space_title || 'N/A'}</td>
                  <td>Bs. {(invoice.amount || 0).toLocaleString()}</td>
                  <td>
                    <span className={`status-badge status-${invoice.status || 'pending'}`}>
                      {invoice.status === 'paid' ? 'Pagada' : 
                       invoice.status === 'pending' ? 'Pendiente' : 
                       invoice.status === 'cancelled' ? 'Cancelada' : invoice.status || 'Pendiente'}
                    </span>
                  </td>
                  <td>
                    {invoice.pdf_url && (
                      <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                        Ver PDF
                      </a>
                    )}
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

export default OwnerDashboard
