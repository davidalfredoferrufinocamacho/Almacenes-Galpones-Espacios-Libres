import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Auth.css'

function Register() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    role: 'GUEST',
    person_type: 'natural',
    first_name: '',
    last_name: '',
    company_name: '',
    ci: '',
    ci_extension: '',
    nit: '',
    phone: '',
    city: '',
    department: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const departments = [
    'La Paz', 'Santa Cruz', 'Cochabamba', 'Oruro', 'Potosi', 
    'Chuquisaca', 'Tarija', 'Beni', 'Pando'
  ]

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Las contrasenas no coinciden')
      return
    }

    if (formData.password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres')
      return
    }

    setLoading(true)

    try {
      await register(formData)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container auth-register card">
        <h1>Crear Cuenta</h1>
        <p className="auth-subtitle">Unete a AlmacenesBO</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Tipo de Usuario</label>
              <select name="role" value={formData.role} onChange={handleChange}>
                <option value="GUEST">Busco alquilar (GUEST)</option>
                <option value="HOST">Ofrezco espacios (HOST)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Tipo de Persona</label>
              <select name="person_type" value={formData.person_type} onChange={handleChange}>
                <option value="natural">Persona Natural</option>
                <option value="juridica">Persona Juridica</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Correo Electronico</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="tu@email.com"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Contrasena</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Minimo 8 caracteres"
              />
            </div>

            <div className="form-group">
              <label>Confirmar Contrasena</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Repite la contrasena"
              />
            </div>
          </div>

          {formData.person_type === 'natural' ? (
            <div className="form-row">
              <div className="form-group">
                <label>Nombre</label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Apellido</label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label>Razon Social</label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                required
              />
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>CI (Carnet de Identidad)</label>
              <input
                type="text"
                name="ci"
                value={formData.ci}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label>Extension</label>
              <select name="ci_extension" value={formData.ci_extension} onChange={handleChange}>
                <option value="">Seleccione</option>
                <option value="LP">LP</option>
                <option value="SC">SC</option>
                <option value="CB">CB</option>
                <option value="OR">OR</option>
                <option value="PT">PT</option>
                <option value="CH">CH</option>
                <option value="TJ">TJ</option>
                <option value="BN">BN</option>
                <option value="PD">PD</option>
              </select>
            </div>
          </div>

          {formData.person_type === 'juridica' && (
            <div className="form-group">
              <label>NIT (Obligatorio para empresas)</label>
              <input
                type="text"
                name="nit"
                value={formData.nit}
                onChange={handleChange}
                required
              />
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Telefono</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
              />
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

          <div className="form-group">
            <label>Ciudad</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              required
            />
          </div>

          <div className="terms-notice">
            <p>
              Al registrarte, aceptas nuestros{' '}
              <Link to="/legal/terminos" target="_blank">Terminos y Condiciones</Link>,{' '}
              <Link to="/legal/privacidad" target="_blank">Politica de Privacidad</Link> y la{' '}
              <Link to="/legal/anti-bypass" target="_blank">Clausula Anti-Bypass</Link>.
            </p>
          </div>

          <button type="submit" className="btn btn-primary auth-btn" disabled={loading}>
            {loading ? 'Registrando...' : 'Crear Cuenta'}
          </button>
        </form>

        <p className="auth-footer">
          Ya tienes cuenta? <Link to="/login">Inicia sesion</Link>
        </p>
      </div>
    </div>
  )
}

export default Register
