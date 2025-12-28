import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import './VerifyEmail.css'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
})

function VerifyEmail() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('verifying')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (token) {
      verifyEmail()
    } else {
      setStatus('error')
      setMessage('Token de verificacion no proporcionado')
    }
  }, [token])

  const verifyEmail = async () => {
    try {
      const res = await api.get(`/auth/verify-email/${token}`)
      setStatus('success')
      setMessage(res.data.message)
    } catch (error) {
      setStatus('error')
      setMessage(error.response?.data?.error || 'Error al verificar cuenta')
    }
  }

  return (
    <div className="verify-email-page">
      <div className="verify-container">
        {status === 'verifying' && (
          <div className="verify-status verifying">
            <div className="spinner"></div>
            <h2>Verificando tu cuenta...</h2>
            <p>Por favor espera mientras verificamos tu correo electronico.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="verify-status success">
            <div className="status-icon">✓</div>
            <h2>Cuenta Verificada</h2>
            <p>{message}</p>
            <button onClick={() => navigate('/login')} className="btn btn-primary">
              Iniciar Sesion
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="verify-status error">
            <div className="status-icon">✗</div>
            <h2>Error de Verificacion</h2>
            <p>{message}</p>
            <div className="action-buttons">
              <button onClick={() => navigate('/login')} className="btn btn-primary">
                Iniciar Sesion
              </button>
              <button onClick={() => navigate('/registro')} className="btn btn-secondary">
                Registrarse
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default VerifyEmail
