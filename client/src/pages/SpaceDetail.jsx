import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import Calculator from '../components/Calculator'
import './SpaceDetail.css'

function SpaceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const [space, setSpace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calculation, setCalculation] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const spaceTypes = {
    almacen: 'Almacen',
    galpon: 'Galpon',
    deposito: 'Deposito',
    cuarto: 'Cuarto',
    contenedor: 'Contenedor',
    patio: 'Patio',
    terreno: 'Terreno'
  }

  useEffect(() => {
    loadSpace()
  }, [id])

  const loadSpace = async () => {
    try {
      const response = await api.get(`/spaces/${id}`)
      setSpace(response.data)
    } catch (error) {
      console.error('Error loading space:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleReserve = async () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    if (user.role !== 'GUEST') {
      setError('Solo los usuarios GUEST pueden reservar espacios')
      return
    }

    if (!calculation) {
      setError('Por favor use la calculadora para calcular el monto')
      return
    }

    setProcessing(true)
    setError('')

    try {
      const response = await api.post('/payments/deposit', {
        space_id: id,
        sqm_requested: calculation.sqm,
        period_type: calculation.periodType,
        period_quantity: calculation.quantity,
        payment_method: paymentMethod
      })

      navigate(`/mis-reservaciones?new=${response.data.reservation_id}`)
    } catch (error) {
      setError(error.response?.data?.error || 'Error al procesar el pago')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  if (!space) {
    return <div className="container"><p>Espacio no encontrado</p></div>
  }

  return (
    <div className="space-detail">
      <div className="container">
        <div className="detail-layout">
          <div className="detail-main">
            <div className="gallery card">
              {space.photos?.length > 0 ? (
                <div className="photos-grid">
                  {space.photos.map((photo, index) => (
                    <img key={photo.id} src={photo.url} alt={`${space.title} - ${index + 1}`} />
                  ))}
                </div>
              ) : (
                <div className="no-photos">
                  <p>Sin fotos disponibles</p>
                </div>
              )}
            </div>

            {space.video_url && (
              <div className="video-section card">
                <h3>Video del Espacio (Obligatorio)</h3>
                <video controls>
                  <source src={space.video_url} type="video/mp4" />
                  Tu navegador no soporta video HTML5.
                </video>
                <p className="video-notice">
                  Este video forma parte del contrato y no puede modificarse una vez firmado.
                </p>
              </div>
            )}

            <div className="info-section card">
              <span className="space-type-badge">{spaceTypes[space.space_type]}</span>
              <h1>{space.title}</h1>
              {isAuthenticated ? (
                <p className="location">{space.address}, {space.city}, {space.department}</p>
              ) : (
                <p className="location">{space.city}, {space.department}</p>
              )}
              
              {(space.available_from || space.available_until) && (
                <div className="availability-dates">
                  <strong>Disponibilidad:</strong>{' '}
                  {space.available_from && <span>Desde {new Date(space.available_from).toLocaleDateString('es-BO')}</span>}
                  {space.available_from && space.available_until && ' - '}
                  {space.available_until && <span>Hasta {new Date(space.available_until).toLocaleDateString('es-BO')}</span>}
                </div>
              )}

              <div className="structural-info">
                <div className="info-item">
                  <strong>m² Totales</strong>
                  <span>{space.total_sqm} m²</span>
                </div>
                <div className="info-item">
                  <strong>m² Disponibles</strong>
                  <span>{space.available_sqm} m²</span>
                </div>
              </div>

              <h3>Condiciones del Espacio</h3>
              <div className="conditions-grid">
                <div className="condition">
                  <span className="label">Tipo:</span>
                  <span className="value">{space.is_open ? 'Abierto' : 'Cerrado'}</span>
                </div>
                <div className="condition">
                  <span className="label">Techo:</span>
                  <span className="value">{space.has_roof ? 'Si' : 'No'}</span>
                </div>
                <div className="condition">
                  <span className="label">Proteccion lluvia:</span>
                  <span className="value">{space.rain_protected ? 'Si' : 'No'}</span>
                </div>
                <div className="condition">
                  <span className="label">Proteccion polvo:</span>
                  <span className="value">{space.dust_protected ? 'Si' : 'No'}</span>
                </div>
                <div className="condition">
                  <span className="label">Acceso:</span>
                  <span className="value">{space.access_type === 'libre' ? 'Libre' : 'Controlado'}</span>
                </div>
                <div className="condition">
                  <span className="label">Seguridad:</span>
                  <span className="value">{space.has_security ? 'Si' : 'No'}</span>
                </div>
              </div>

              {space.security_description && (
                <div className="security-info">
                  <strong>Seguridad ofrecida:</strong>
                  <p>{space.security_description}</p>
                </div>
              )}

              {space.schedule && (
                <div className="schedule-info">
                  <strong>Horarios:</strong>
                  <p>{space.schedule}</p>
                </div>
              )}

              <h3>Descripcion Detallada</h3>
              <div className="description">
                <p>{space.description}</p>
              </div>

              {isAuthenticated && (
                <>
                  <h3>Informacion del HOST</h3>
                  <div className="host-info">
                    <p>
                      <strong>{space.host_person_type === 'juridica' ? 'Razon Social' : 'Nombre'}:</strong>{' '}
                      {space.host_company || `${space.host_first_name} ${space.host_last_name}`}
                    </p>
                    <p><strong>Ubicacion:</strong> {space.host_city}, {space.host_department}</p>
                    <p className="no-contact">No se permite contacto directo - Use la plataforma</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <aside className="detail-sidebar">
            <div className="prices-card card">
              <h3>Precios por m²</h3>
              <div className="prices-list">
                {space.price_per_sqm_day > 0 && (
                  <div className="price-row">
                    <span>Dia</span>
                    <span>Bs. {space.price_per_sqm_day}</span>
                  </div>
                )}
                {space.price_per_sqm_week > 0 && (
                  <div className="price-row">
                    <span>Semana</span>
                    <span>Bs. {space.price_per_sqm_week}</span>
                  </div>
                )}
                {space.price_per_sqm_month > 0 && (
                  <div className="price-row">
                    <span>Mes</span>
                    <span>Bs. {space.price_per_sqm_month}</span>
                  </div>
                )}
                {space.price_per_sqm_quarter > 0 && (
                  <div className="price-row">
                    <span>Trimestre</span>
                    <span>Bs. {space.price_per_sqm_quarter}</span>
                  </div>
                )}
                {space.price_per_sqm_semester > 0 && (
                  <div className="price-row">
                    <span>Semestre</span>
                    <span>Bs. {space.price_per_sqm_semester}</span>
                  </div>
                )}
                {space.price_per_sqm_year > 0 && (
                  <div className="price-row">
                    <span>Ano</span>
                    <span>Bs. {space.price_per_sqm_year}</span>
                  </div>
                )}
              </div>
            </div>

            <Calculator 
              space={space} 
              depositPercentage={space.deposit_percentage}
              onCalculate={setCalculation}
            />

            {isAuthenticated ? (
              <div className="reserve-card card">
                <h3>Pagar Anticipo y Reservar</h3>
                <p className="reserve-info">
                  El anticipo ({space.deposit_percentage}%) queda en escrow hasta confirmar el contrato.
                  Reembolso 100% si no confirma.
                </p>

                <div className="form-group">
                  <label>Metodo de Pago</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="card">Tarjeta</option>
                    <option value="qr">QR</option>
                  </select>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                <button 
                  className="btn btn-primary reserve-btn" 
                  onClick={handleReserve}
                  disabled={processing || !calculation}
                >
                  {processing ? 'Procesando...' : `Pagar Anticipo Bs. ${calculation?.deposit?.toFixed(2) || '0.00'}`}
                </button>
              </div>
            ) : (
              <div className="login-prompt card">
                <h3>Reservar este Espacio</h3>
                <p>Para ver la direccion completa y realizar una reserva, inicia sesion o registrate.</p>
                <div className="login-buttons">
                  <button className="btn btn-primary" onClick={() => navigate('/login')}>
                    Iniciar Sesion
                  </button>
                  <button className="btn btn-secondary" onClick={() => navigate('/registro')}>
                    Registrarse
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

export default SpaceDetail
