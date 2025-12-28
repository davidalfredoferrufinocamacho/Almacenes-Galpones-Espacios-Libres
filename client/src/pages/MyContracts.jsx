import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import './MyContracts.css'

function MyContracts() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [signingId, setSigningId] = useState(null)
  const [otp, setOtp] = useState('')

  useEffect(() => {
    loadContracts()
  }, [])

  const loadContracts = async () => {
    try {
      const response = await api.get('/client/contracts')
      setContracts(response.data)
    } catch (error) {
      console.error('Error loading contracts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestOtp = async (contractId) => {
    try {
      const response = await api.post(`/contracts/${contractId}/request-otp`)
      alert(response.data.message)
      setSigningId(contractId)
    } catch (error) {
      alert(error.response?.data?.error || 'Error al solicitar OTP')
    }
  }

  const handleSign = async (contractId) => {
    try {
      await api.post(`/contracts/${contractId}/sign`, { otp })
      setSigningId(null)
      setOtp('')
      loadContracts()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al firmar')
    }
  }

  const handleExtend = async (contractId) => {
    const periodType = prompt('Tipo de periodo (dia, semana, mes, trimestre, semestre, ano):')
    const quantity = prompt('Cantidad de periodos:')

    if (!periodType || !quantity) return

    try {
      await api.post(`/contracts/${contractId}/extend`, {
        period_type: periodType,
        period_quantity: parseInt(quantity),
        payment_method: 'card'
      })
      loadContracts()
      alert('Alquiler extendido exitosamente')
    } catch (error) {
      alert(error.response?.data?.error || 'Error al extender')
    }
  }

  const statusLabels = {
    pending: 'Pendiente Firma',
    signed: 'Firmado',
    active: 'Activo',
    completed: 'Completado',
    extended: 'Extendido'
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="my-contracts">
      <div className="page-header">
        <div className="container">
          <h1>Mis Contratos</h1>
        </div>
      </div>

      <div className="container">
        {contracts.length === 0 ? (
          <div className="empty-state card">
            <h3>No tienes contratos</h3>
            <p>Los contratos apareceran aqui cuando confirmes una reservacion</p>
          </div>
        ) : (
          <div className="contracts-list">
            {contracts.map(contract => (
              <div key={contract.id} className="contract-item card">
                <div className="contract-header">
                  <div>
                    <h3>{contract.space_title}</h3>
                    <span className="contract-number">#{contract.contract_number}</span>
                  </div>
                  <span className={`status-badge status-${contract.status}`}>
                    {statusLabels[contract.status]}
                  </span>
                </div>

                <div className="contract-details">
                  <div className="detail-row">
                    <span>Periodo:</span>
                    <span>{contract.start_date} al {contract.end_date}</span>
                  </div>
                  <div className="detail-row">
                    <span>Metros cuadrados:</span>
                    <span>{contract.sqm} m²</span>
                  </div>
                  <div className="detail-row">
                    <span>Monto total:</span>
                    <span className="amount">Bs. {contract.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="detail-row">
                    <span>Comision plataforma:</span>
                    <span>Bs. {contract.commission_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="signatures">
                  <div className={`signature ${contract.guest_signed ? 'signed' : ''}`}>
                    <span>GUEST:</span>
                    <span>{contract.guest_signed ? 'Firmado' : 'Pendiente'}</span>
                  </div>
                  <div className={`signature ${contract.host_signed ? 'signed' : ''}`}>
                    <span>HOST:</span>
                    <span>{contract.host_signed ? 'Firmado' : 'Pendiente'}</span>
                  </div>
                </div>

                {signingId === contract.id && (
                  <div className="signing-section">
                    <p>Ingrese el codigo OTP (ver consola del servidor en DEMO):</p>
                    <input 
                      type="text" 
                      value={otp} 
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="Codigo de 6 digitos"
                      maxLength="6"
                      style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem', width: '200px' }}
                    />
                    <p className="disclaimer">[DEMO/MOCK - Sin validez legal]</p>
                    <button onClick={() => handleSign(contract.id)} className="btn btn-primary" disabled={otp.length !== 6}>
                      Confirmar Firma
                    </button>
                    <button onClick={() => { setSigningId(null); setOtp(''); }} className="btn btn-outline">
                      Cancelar
                    </button>
                  </div>
                )}

                <div className="contract-actions">
                  {contract.status === 'pending' && !signingId && (
                    <>
                      {user.role === 'GUEST' && !contract.guest_signed && (
                        <button onClick={() => handleRequestOtp(contract.id)} className="btn btn-primary">
                          Solicitar Codigo para Firmar
                        </button>
                      )}
                      {user.role === 'HOST' && contract.guest_signed && !contract.host_signed && (
                        <button onClick={() => handleRequestOtp(contract.id)} className="btn btn-primary">
                          Solicitar Codigo para Firmar
                        </button>
                      )}
                    </>
                  )}

                  {(contract.status === 'signed' || contract.status === 'active') && user.role === 'GUEST' && (
                    <button onClick={() => handleExtend(contract.id)} className="btn btn-secondary">
                      Alargar Alquiler
                    </button>
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

export default MyContracts
