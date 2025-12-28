import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './CreateSpace.css'

function CreateSpace() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [spaceId, setSpaceId] = useState(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    space_type: 'almacen',
    total_sqm: '',
    available_sqm: '',
    price_per_sqm_day: '',
    price_per_sqm_week: '',
    price_per_sqm_month: '',
    price_per_sqm_quarter: '',
    price_per_sqm_semester: '',
    price_per_sqm_year: '',
    is_open: false,
    has_roof: true,
    rain_protected: true,
    dust_protected: true,
    access_type: 'controlado',
    has_security: false,
    security_description: '',
    schedule: '',
    address: '',
    city: '',
    department: '',
    latitude: '',
    longitude: ''
  })

  const departments = [
    'La Paz', 'Santa Cruz', 'Cochabamba', 'Oruro', 'Potosi', 
    'Chuquisaca', 'Tarija', 'Beni', 'Pando'
  ]

  const spaceTypes = [
    { value: 'almacen', label: 'Almacen' },
    { value: 'galpon', label: 'Galpon' },
    { value: 'deposito', label: 'Deposito' },
    { value: 'cuarto', label: 'Cuarto' },
    { value: 'contenedor', label: 'Contenedor' },
    { value: 'patio', label: 'Patio' },
    { value: 'terreno', label: 'Terreno' }
  ]

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmitBasic = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const submitData = { ...formData }
      if (submitData.latitude === '') delete submitData.latitude
      if (submitData.longitude === '') delete submitData.longitude
      // Importante: El endpoint es /owner/spaces y los campos m2 deben estar presentes
      const response = await api.post('/owner/spaces', submitData)
      setSpaceId(response.data.id)
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear espacio')
    } finally {
      setLoading(false)
    }
  }

  const handleUploadPhotos = async (e) => {
    const files = e.target.files
    if (!files.length) return

    setLoading(true)
    setError('')

    const formDataUpload = new FormData()
    for (let i = 0; i < files.length; i++) {
      formDataUpload.append('photos', files[i])
    }

    try {
      await api.post(`/owner/spaces/${spaceId}/photos`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setStep(3)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al subir fotos')
    } finally {
      setLoading(false)
    }
  }

  const handleUploadVideo = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    setLoading(true)
    setError('')

    const formDataUpload = new FormData()
    formDataUpload.append('video', file)
    formDataUpload.append('duration', '45')

    try {
      await api.post(`/owner/spaces/${spaceId}/video`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setStep(4)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al subir video')
    } finally {
      setLoading(false)
    }
  }

  const handlePublish = async () => {
    setLoading(true)
    setError('')

    try {
      await api.put(`/owner/spaces/${spaceId}/publish`)
      navigate('/owner/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al publicar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-space">
      <div className="page-header">
        <div className="container">
          <h1>Crear Nuevo Espacio</h1>
          <p>Paso {step} de 4</p>
        </div>
      </div>

      <div className="container">
        <div className="progress-bar">
          <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>Informacion</div>
          <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>Fotos</div>
          <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>Video</div>
          <div className={`progress-step ${step >= 4 ? 'active' : ''}`}>Publicar</div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {step === 1 && (
          <form onSubmit={handleSubmitBasic} className="space-form card">
            <h2>Informacion del Espacio</h2>

            <div className="form-group">
              <label>Titulo</label>
              <input type="text" name="title" value={formData.title} onChange={handleChange} required />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tipo de Espacio</label>
                <select name="space_type" value={formData.space_type} onChange={handleChange}>
                  {spaceTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Departamento</label>
                <select name="department" value={formData.department} onChange={handleChange} required>
                  <option value="">Seleccione</option>
                  {departments.map(dep => (
                    <option key={dep} value={dep}>{dep}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Ciudad</label>
                <input type="text" name="city" value={formData.city} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Direccion</label>
                <input type="text" name="address" value={formData.address} onChange={handleChange} required />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Latitud (opcional)</label>
                <input type="number" name="latitude" value={formData.latitude} onChange={handleChange} step="any" min="-90" max="90" placeholder="Ej: -16.5" />
              </div>
              <div className="form-group">
                <label>Longitud (opcional)</label>
                <input type="number" name="longitude" value={formData.longitude} onChange={handleChange} step="any" min="-180" max="180" placeholder="Ej: -68.1" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>m² Totales</label>
                <input type="number" name="total_sqm" value={formData.total_sqm} onChange={handleChange} required min="1" />
              </div>
              <div className="form-group">
                <label>m² Disponibles</label>
                <input type="number" name="available_sqm" value={formData.available_sqm} onChange={handleChange} required min="1" />
              </div>
            </div>

            <h3>Precios por m²</h3>
            <div className="prices-grid">
              <div className="form-group">
                <label>Dia (Bs.)</label>
                <input type="number" name="price_per_sqm_day" value={formData.price_per_sqm_day} onChange={handleChange} step="0.01" />
              </div>
              <div className="form-group">
                <label>Semana (Bs.)</label>
                <input type="number" name="price_per_sqm_week" value={formData.price_per_sqm_week} onChange={handleChange} step="0.01" />
              </div>
              <div className="form-group">
                <label>Mes (Bs.)</label>
                <input type="number" name="price_per_sqm_month" value={formData.price_per_sqm_month} onChange={handleChange} step="0.01" />
              </div>
              <div className="form-group">
                <label>Trimestre (Bs.)</label>
                <input type="number" name="price_per_sqm_quarter" value={formData.price_per_sqm_quarter} onChange={handleChange} step="0.01" />
              </div>
              <div className="form-group">
                <label>Semestre (Bs.)</label>
                <input type="number" name="price_per_sqm_semester" value={formData.price_per_sqm_semester} onChange={handleChange} step="0.01" />
              </div>
              <div className="form-group">
                <label>Ano (Bs.)</label>
                <input type="number" name="price_per_sqm_year" value={formData.price_per_sqm_year} onChange={handleChange} step="0.01" />
              </div>
            </div>

            <h3>Condiciones</h3>
            <div className="conditions-form">
              <label className="checkbox-label">
                <input type="checkbox" name="is_open" checked={formData.is_open} onChange={handleChange} />
                Espacio abierto
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="has_roof" checked={formData.has_roof} onChange={handleChange} />
                Con techo
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="rain_protected" checked={formData.rain_protected} onChange={handleChange} />
                Protegido de lluvia
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="dust_protected" checked={formData.dust_protected} onChange={handleChange} />
                Protegido de polvo
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="has_security" checked={formData.has_security} onChange={handleChange} />
                Con seguridad
              </label>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Tipo de Acceso</label>
                <select name="access_type" value={formData.access_type} onChange={handleChange}>
                  <option value="libre">Libre</option>
                  <option value="controlado">Controlado</option>
                </select>
              </div>
              <div className="form-group">
                <label>Horarios</label>
                <input type="text" name="schedule" value={formData.schedule} onChange={handleChange} placeholder="Ej: Lun-Vie 8:00-18:00" />
              </div>
            </div>

            <div className="form-group">
              <label>Descripcion Detallada (minimo 50 caracteres)</label>
              <textarea name="description" value={formData.description} onChange={handleChange} required rows="5" minLength="50"></textarea>
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Continuar'}
            </button>
          </form>
        )}

        {step === 2 && (
          <div className="upload-section card">
            <h2>Subir Fotos</h2>
            <p>Las fotos son obligatorias y forman parte del material precontractual.</p>
            <input type="file" accept="image/*" multiple onChange={handleUploadPhotos} disabled={loading} />
            {loading && <p>Subiendo fotos...</p>}
          </div>
        )}

        {step === 3 && (
          <div className="upload-section card">
            <h2>Subir Video Explicativo</h2>
            <p>El video es OBLIGATORIO (30-60 segundos) y debe mostrar:</p>
            <ul>
              <li>Interior completo</li>
              <li>Paredes, techo, piso, puertas</li>
              <li>Forma de ingreso</li>
              <li>Vista del acceso desde la calle</li>
            </ul>
            <p className="warning">El video forma parte del contrato y no puede modificarse despues de firmar.</p>
            <input type="file" accept="video/*" onChange={handleUploadVideo} disabled={loading} />
            {loading && <p>Subiendo video...</p>}
          </div>
        )}

        {step === 4 && (
          <div className="publish-section card">
            <h2>Publicar Espacio</h2>
            <p>Tu espacio esta listo para ser publicado.</p>
            <p>Al publicar, los clientes podran verlo y reservarlo.</p>
            <button className="btn btn-primary" onClick={handlePublish} disabled={loading}>
              {loading ? 'Publicando...' : 'Publicar Espacio'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CreateSpace
