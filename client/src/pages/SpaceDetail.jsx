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
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [appointmentData, setAppointmentData] = useState({ date: '', time: '', notes: '' })
  const [antiBypassAccepted, setAntiBypassAccepted] = useState(false)
  const [antiBypassText, setAntiBypassText] = useState('')
  const [availableSlots, setAvailableSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)

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

  useEffect(() => {
    if (isAuthenticated) {
      loadAntiBypassText()
    }
  }, [isAuthenticated])

  const loadAntiBypassText = async () => {
    try {
      const response = await api.get('/legal/by-type/anti_bypass_guest')
      if (response.data) {
        setAntiBypassText(response.data.content)
      }
    } catch (err) {
      console.error('Error loading anti-bypass text:', err)
    }
  }

  const loadAvailableSlots = async () => {
    setLoadingSlots(true)
    try {
      const response = await api.get(`/spaces/${id}/available-slots`)
      setAvailableSlots(response.data.available_slots || [])
      if (response.data.available_slots?.length === 0) {
        setError('El propietario aun no ha configurado su disponibilidad para este espacio')
      }
    } catch (err) {
      console.error('Error loading slots:', err)
      if (err.response?.status === 404) {
        setError('El propietario aun no ha configurado su disponibilidad para este espacio')
      } else {
        setError('Error al cargar horarios disponibles')
      }
    } finally {
      setLoadingSlots(false)
    }
  }

  const handleScheduleAppointment = async () => {
    if (!calculation) {
      setError('Por favor use la calculadora para calcular el monto')
      return
    }
    setError('')
    setSelectedSlot(null)
    setShowAppointmentModal(true)
    loadAvailableSlots()
  }

  const handleSubmitAppointment = async () => {
    if (!antiBypassAccepted) {
      setError('Debe aceptar la clausula anti-bypass para continuar')
      return
    }
    if (!selectedSlot) {
      setError('Debe seleccionar un horario disponible')
      return
    }

    setProcessing(true)
    setError('')

    try {
      await api.post(`/spaces/${id}/request-appointment`, {
        scheduled_date: selectedSlot.date,
        scheduled_time: selectedSlot.time,
        notes: appointmentData.notes
      })

      alert('Cita solicitada exitosamente. El propietario debe confirmarla.')
      setShowAppointmentModal(false)
      navigate('/cliente')
    } catch (error) {
      setError(error.response?.data?.error || 'Error al agendar cita')
    } finally {
      setProcessing(false)
    }
  }

  const handlePay100 = async () => {
    if (!calculation) {
      setError('Por favor use la calculadora para calcular el monto')
      return
    }
    setShowPaymentModal(true)
  }

  const handleSubmitPayment = async () => {
    setProcessing(true)
    setError('')

    try {
      const response = await api.post('/payments/full', {
        space_id: id,
        sqm_requested: calculation.sqm,
        period_type: calculation.periodType,
        period_quantity: calculation.quantity,
        payment_method: paymentMethod
      })

      alert('Pago realizado exitosamente. Ahora puede generar su contrato.')
      setShowPaymentModal(false)
      navigate(`/mis-reservaciones?new=${response.data.reservation_id}`)
    } catch (error) {
      setError(error.response?.data?.error || 'Error al procesar el pago')
    } finally {
      setProcessing(false)
    }
  }

  const handleNotInterested = () => {
    navigate('/')
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

            <div className="space-header card">
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
              onCalculate={setCalculation}
            />

            {isAuthenticated ? (
              <div className="reserve-card card">
                <h3>Opciones de Reserva</h3>
                
                {error && <div className="alert alert-error">{error}</div>}

                <div className="reserve-options">
                  <button 
                    className="btn btn-secondary reserve-btn" 
                    onClick={handleScheduleAppointment}
                    disabled={processing || !calculation}
                  >
                    Agendar Cita
                  </button>

                  <button 
                    className="btn btn-primary reserve-btn" 
                    onClick={handlePay100}
                    disabled={processing || !calculation}
                  >
                    {processing ? 'Procesando...' : `Pagar 100% - Bs. ${calculation?.total?.toFixed(2) || '0.00'}`}
                  </button>

                  <button 
                    className="btn btn-outline reserve-btn" 
                    onClick={handleNotInterested}
                  >
                    No me interesa
                  </button>
                </div>
              </div>
            ) : (
              <div className="login-prompt card">
                <h3>Reservar este Espacio</h3>
                <p>Para ver la direccion completa y realizar una reserva, inicia sesion o registrate.</p>
                <div className="login-buttons">
                  <button className="btn btn-primary" onClick={() => navigate(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`)}>
                    Iniciar Sesion
                  </button>
                  <button className="btn btn-secondary" onClick={() => navigate(`/registro?returnTo=${encodeURIComponent(window.location.pathname)}`)}>
                    Registrarse
                  </button>
                </div>
              </div>
            )}
          </aside>

          {showAppointmentModal && (
            <div className="modal-overlay" onClick={() => setShowAppointmentModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                <div className="modal-header">
                  <h2>Agendar Visita</h2>
                  <button className="close-btn" onClick={() => setShowAppointmentModal(false)}>×</button>
                </div>
                <div className="modal-body">
                  <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
                    <strong>{space.title}</strong>
                  </p>

                  <div className="form-group">
                    <label><strong>Seleccione un horario disponible</strong></label>
                    {loadingSlots ? (
                      <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <div className="spinner"></div>
                        <p>Cargando horarios...</p>
                      </div>
                    ) : availableSlots.length > 0 ? (
                      <div style={{ maxHeight: '250px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem' }}>
                        {(() => {
                          const slotsByDate = availableSlots.reduce((acc, slot) => {
                            if (!acc[slot.date]) acc[slot.date] = []
                            acc[slot.date].push(slot)
                            return acc
                          }, {})
                          return Object.entries(slotsByDate).map(([date, slots]) => (
                            <div key={date} style={{ marginBottom: '1rem' }}>
                              <div style={{ fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.25rem' }}>
                                {slots[0].day_name} - {new Date(date + 'T12:00:00').toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {slots.map((slot, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setSelectedSlot(slot)}
                                    style={{
                                      padding: '0.5rem 1rem',
                                      border: selectedSlot?.date === slot.date && selectedSlot?.time === slot.time 
                                        ? '2px solid #3b82f6' 
                                        : '1px solid #d1d5db',
                                      borderRadius: '6px',
                                      background: selectedSlot?.date === slot.date && selectedSlot?.time === slot.time 
                                        ? '#dbeafe' 
                                        : 'white',
                                      cursor: 'pointer',
                                      fontSize: '0.9rem'
                                    }}
                                  >
                                    {slot.time}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))
                        })()}
                      </div>
                    ) : (
                      <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '8px', color: '#92400e' }}>
                        El propietario aun no ha configurado su disponibilidad para este espacio.
                      </div>
                    )}
                  </div>

                  {selectedSlot && (
                    <div style={{ padding: '1rem', background: '#d1fae5', borderRadius: '8px', marginBottom: '1rem' }}>
                      <strong>Horario seleccionado:</strong> {selectedSlot.day_name}, {new Date(selectedSlot.date + 'T12:00:00').toLocaleDateString('es-BO')} a las {selectedSlot.time}
                    </div>
                  )}

                  <div className="form-group">
                    <label>Notas (opcional)</label>
                    <textarea
                      value={appointmentData.notes}
                      onChange={e => setAppointmentData({ ...appointmentData, notes: e.target.value })}
                      className="form-control"
                      placeholder="Informacion adicional para el propietario..."
                      rows={2}
                    />
                  </div>

                  <div className="anti-bypass-section" style={{ marginTop: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '8px' }}>
                    <h4 style={{ color: '#92400e', marginBottom: '0.5rem' }}>Clausula Anti-Bypass</h4>
                    <div style={{ maxHeight: '120px', overflow: 'auto', background: 'white', padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      {antiBypassText || 'Cargando clausula...'}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={antiBypassAccepted}
                        onChange={e => setAntiBypassAccepted(e.target.checked)}
                      />
                      Acepto la clausula anti-bypass
                    </label>
                  </div>

                  {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}
                </div>
                <div className="modal-footer">
                  <button onClick={() => setShowAppointmentModal(false)} className="btn btn-secondary">Cancelar</button>
                  <button 
                    onClick={handleSubmitAppointment} 
                    className="btn btn-primary"
                    disabled={processing || !antiBypassAccepted || !selectedSlot || availableSlots.length === 0}
                  >
                    {processing ? 'Agendando...' : 'Solicitar Cita'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showPaymentModal && (
            <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Pagar Alquiler Completo</h2>
                  <button className="close-btn" onClick={() => setShowPaymentModal(false)}>×</button>
                </div>
                <div className="modal-body">
                  <div style={{ background: '#f3f4f6', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <h4>{space.title}</h4>
                    <p>{calculation?.sqm} m² x {calculation?.quantity} {calculation?.periodType}</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>
                      Total: Bs. {calculation?.total?.toFixed(2)}
                    </p>
                  </div>

                  <div className="form-group">
                    <label>Metodo de Pago</label>
                    <select 
                      value={paymentMethod} 
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="form-control"
                    >
                      <option value="card">Tarjeta</option>
                      <option value="qr">QR</option>
                      <option value="transfer">Transferencia</option>
                    </select>
                  </div>

                  <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '1rem' }}>
                    Al completar el pago, podra generar su contrato de alquiler.
                  </p>

                  {error && <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>}
                </div>
                <div className="modal-footer">
                  <button onClick={() => setShowPaymentModal(false)} className="btn btn-secondary">Cancelar</button>
                  <button 
                    onClick={handleSubmitPayment} 
                    className="btn btn-primary"
                    disabled={processing}
                  >
                    {processing ? 'Procesando...' : `Pagar Bs. ${calculation?.total?.toFixed(2)}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SpaceDetail
