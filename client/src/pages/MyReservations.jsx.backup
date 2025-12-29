import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import './MyReservations.css'

function MyReservations() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReservations()
  }, [])

  const loadReservations = async () => {
    try {
      const response = await api.get('/users/my-reservations')
      setReservations(response.data)
    } catch (error) {
      console.error('Error loading reservations:', error)
    } finally {
      setLoading(false)
    }
  }

  const statusLabels = {
    pending: 'Pendiente',
    PAID_DEPOSIT_ESCROW: 'Anticipo Pagado',
    appointment_scheduled: 'Cita Agendada',
    visit_completed: 'Visita Realizada',
    confirmed: 'Confirmado',
    contract_signed: 'Contrato Firmado',
    completed: 'Completado',
    cancelled: 'Cancelado',
    refunded: 'Reembolsado'
  }

  const handleRefund = async (reservationId) => {
    if (!confirm('Esta seguro de solicitar el reembolso? Esta accion no se puede deshacer.')) {
      return
    }

    try {
      await api.post(`/payments/refund/${reservationId}`)
      loadReservations()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al procesar reembolso')
    }
  }

  const handlePayRemaining = async (reservationId) => {
    try {
      await api.post(`/payments/remaining/${reservationId}`, {
        payment_method: 'card'
      })
      loadReservations()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al procesar pago')
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="my-reservations">
      <div className="page-header">
        <div className="container">
          <h1>Mis Reservaciones</h1>
        </div>
      </div>

      <div className="container">
        {reservations.length === 0 ? (
          <div className="empty-state card">
            <h3>No tienes reservaciones</h3>
            <p>Busca espacios y realiza tu primera reservacion</p>
            <Link to="/espacios" className="btn btn-primary">Ver Espacios</Link>
          </div>
        ) : (
          <div className="reservations-list">
            {reservations.map(reservation => (
              <div key={reservation.id} className="reservation-item card">
                <div className="reservation-header">
                  <h3>{reservation.space_title}</h3>
                  <span className={`status-badge status-${reservation.status.toLowerCase().replace('_', '-')}`}>
                    {statusLabels[reservation.status]}
                  </span>
                </div>

                <div className="reservation-details">
                  <div className="detail">
                    <span className="label">Ubicacion:</span>
                    <span>{reservation.city}, {reservation.department}</span>
                  </div>
                  <div className="detail">
                    <span className="label">m² solicitados:</span>
                    <span>{reservation.sqm_requested} m²</span>
                  </div>
                  <div className="detail">
                    <span className="label">Periodo:</span>
                    <span>{reservation.period_quantity} {reservation.period_type}</span>
                  </div>
                  <div className="detail">
                    <span className="label">Total:</span>
                    <span className="amount">Bs. {reservation.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="detail">
                    <span className="label">Anticipo:</span>
                    <span className="deposit">Bs. {reservation.deposit_amount.toFixed(2)}</span>
                  </div>
                  <div className="detail">
                    <span className="label">Saldo:</span>
                    <span>Bs. {reservation.remaining_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="reservation-actions">
                  {reservation.status === 'PAID_DEPOSIT_ESCROW' && (
                    <>
                      <Link to={`/citas?reservation=${reservation.id}`} className="btn btn-secondary">
                        Agendar Cita
                      </Link>
                      <button onClick={() => handlePayRemaining(reservation.id)} className="btn btn-primary">
                        Pagar Saldo (Sin Visita)
                      </button>
                      <button onClick={() => handleRefund(reservation.id)} className="btn btn-outline danger">
                        No me interesa (Reembolso)
                      </button>
                    </>
                  )}
                  {reservation.status === 'visit_completed' && (
                    <>
                      <button onClick={() => handlePayRemaining(reservation.id)} className="btn btn-primary">
                        Confirmar y Pagar Saldo
                      </button>
                      <button onClick={() => handleRefund(reservation.id)} className="btn btn-outline danger">
                        No me interesa (Reembolso)
                      </button>
                    </>
                  )}
                  {reservation.status === 'confirmed' && (
                    <Link to={`/mis-contratos`} className="btn btn-primary">
                      Firmar Contrato
                    </Link>
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

export default MyReservations
