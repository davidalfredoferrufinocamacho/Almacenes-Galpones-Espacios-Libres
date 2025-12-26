import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import './Appointments.css'

function Appointments() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAppointments()
  }, [])

  const loadAppointments = async () => {
    try {
      const response = await api.get('/appointments/my-appointments')
      setAppointments(response.data)
    } catch (error) {
      console.error('Error loading appointments:', error)
    } finally {
      setLoading(false)
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

  const handleAcceptAntiBypass = async (appointmentId) => {
    try {
      await api.post(`/appointments/${appointmentId}/accept-anti-bypass`)
      loadAppointments()
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  const handleAccept = async (appointmentId) => {
    try {
      await api.put(`/appointments/${appointmentId}/accept`)
      loadAppointments()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al aceptar')
    }
  }

  const handleReject = async (appointmentId) => {
    const reason = prompt('Motivo del rechazo (opcional):')
    try {
      await api.put(`/appointments/${appointmentId}/reject`, { reason })
      loadAppointments()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al rechazar')
    }
  }

  const handleReschedule = async (appointmentId) => {
    const newDate = prompt('Nueva fecha (YYYY-MM-DD):')
    const newTime = prompt('Nueva hora (HH:MM):')
    const reason = prompt('Motivo de reprogramacion:')

    if (!newDate || !newTime) return

    try {
      await api.put(`/appointments/${appointmentId}/reschedule`, {
        new_date: newDate,
        new_time: newTime,
        reason
      })
      loadAppointments()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al reprogramar')
    }
  }

  const handleAcceptReschedule = async (appointmentId) => {
    try {
      await api.put(`/appointments/${appointmentId}/accept-reschedule`)
      loadAppointments()
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  const handleMarkCompleted = async (appointmentId) => {
    try {
      await api.put(`/appointments/${appointmentId}/mark-completed`)
      loadAppointments()
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  const handleMarkNoShow = async (appointmentId) => {
    try {
      await api.put(`/appointments/${appointmentId}/mark-no-show`)
      loadAppointments()
    } catch (error) {
      alert(error.response?.data?.error || 'Error')
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="appointments">
      <div className="page-header">
        <div className="container">
          <h1>Citas y Visitas</h1>
        </div>
      </div>

      <div className="container">
        {appointments.length === 0 ? (
          <div className="empty-state card">
            <h3>No tienes citas programadas</h3>
            <p>Las citas apareceran aqui cuando reserves un espacio</p>
          </div>
        ) : (
          <div className="appointments-list">
            {appointments.map(appointment => (
              <div key={appointment.id} className="appointment-item card">
                <div className="appointment-header">
                  <h3>{appointment.space_title}</h3>
                  <span className={`status-badge status-${appointment.status.replace('_', '-')}`}>
                    {statusLabels[appointment.status]}
                  </span>
                </div>

                <div className="appointment-details">
                  <div className="detail">
                    <span className="label">Fecha:</span>
                    <span>{appointment.scheduled_date}</span>
                  </div>
                  <div className="detail">
                    <span className="label">Hora:</span>
                    <span>{appointment.scheduled_time}</span>
                  </div>
                  {user.role === 'HOST' && (
                    <div className="detail">
                      <span className="label">Cliente:</span>
                      <span>{appointment.guest_first_name} {appointment.guest_last_name}</span>
                    </div>
                  )}
                  {user.role === 'GUEST' && (
                    <div className="detail">
                      <span className="label">Propietario:</span>
                      <span>{appointment.host_first_name} {appointment.host_last_name}</span>
                    </div>
                  )}
                </div>

                {appointment.status === 'reprogramada' && (
                  <div className="reschedule-info">
                    <p>Nueva fecha propuesta: {appointment.reschedule_date} a las {appointment.reschedule_time}</p>
                    {appointment.reschedule_reason && <p>Motivo: {appointment.reschedule_reason}</p>}
                  </div>
                )}

                {user.role === 'GUEST' && !appointment.anti_bypass_guest_accepted && appointment.status === 'solicitada' && (
                  <div className="anti-bypass-notice">
                    <p>Debe aceptar la clausula anti-bypass antes de confirmar la cita.</p>
                    <button onClick={() => handleAcceptAntiBypass(appointment.id)} className="btn btn-primary">
                      Aceptar Clausula Anti-Bypass
                    </button>
                  </div>
                )}

                <div className="appointment-actions">
                  {user.role === 'HOST' && appointment.status === 'solicitada' && (
                    <>
                      <button onClick={() => handleAccept(appointment.id)} className="btn btn-primary">
                        Aceptar
                      </button>
                      <button onClick={() => handleReject(appointment.id)} className="btn btn-outline">
                        Rechazar
                      </button>
                      <button onClick={() => handleReschedule(appointment.id)} className="btn btn-secondary">
                        Reprogramar
                      </button>
                    </>
                  )}

                  {user.role === 'GUEST' && appointment.status === 'reprogramada' && (
                    <button onClick={() => handleAcceptReschedule(appointment.id)} className="btn btn-primary">
                      Aceptar Nueva Fecha
                    </button>
                  )}

                  {user.role === 'HOST' && appointment.status === 'aceptada' && (
                    <>
                      <button onClick={() => handleMarkCompleted(appointment.id)} className="btn btn-primary">
                        Marcar como Realizada
                      </button>
                      <button onClick={() => handleMarkNoShow(appointment.id)} className="btn btn-outline">
                        No Asistio
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Appointments
