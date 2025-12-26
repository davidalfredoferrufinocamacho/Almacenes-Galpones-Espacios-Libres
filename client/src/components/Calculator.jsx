import { useState, useEffect } from 'react'
import './Calculator.css'

function Calculator({ space, depositPercentage, onCalculate }) {
  const [sqm, setSqm] = useState(10)
  const [periodType, setPeriodType] = useState('mes')
  const [quantity, setQuantity] = useState(1)
  const [calculation, setCalculation] = useState(null)

  const periodLabels = {
    dia: 'Dia(s)',
    semana: 'Semana(s)',
    mes: 'Mes(es)',
    trimestre: 'Trimestre(s)',
    semestre: 'Semestre(s)',
    ano: 'Ano(s)'
  }

  const priceFields = {
    dia: 'price_per_sqm_day',
    semana: 'price_per_sqm_week',
    mes: 'price_per_sqm_month',
    trimestre: 'price_per_sqm_quarter',
    semestre: 'price_per_sqm_semester',
    ano: 'price_per_sqm_year'
  }

  useEffect(() => {
    calculate()
  }, [sqm, periodType, quantity])

  const calculate = () => {
    const pricePerSqm = space[priceFields[periodType]] || 0
    
    if (pricePerSqm === 0) {
      setCalculation(null)
      return
    }

    const total = pricePerSqm * sqm * quantity
    const deposit = (total * depositPercentage) / 100
    const remaining = total - deposit

    const result = {
      sqm,
      periodType,
      quantity,
      pricePerSqm,
      total,
      depositPercentage,
      deposit,
      remaining
    }

    setCalculation(result)
    if (onCalculate) {
      onCalculate(result)
    }
  }

  const availablePeriods = Object.entries(priceFields)
    .filter(([key, field]) => space[field] > 0)
    .map(([key]) => key)

  return (
    <div className="calculator card">
      <h3>Calculadora de Alquiler</h3>
      
      <div className="calc-form">
        <div className="form-group">
          <label>Metros cuadrados (m²)</label>
          <input
            type="number"
            min="1"
            max={space.available_sqm}
            value={sqm}
            onChange={(e) => setSqm(Math.min(parseFloat(e.target.value) || 1, space.available_sqm))}
          />
          <small>Disponibles: {space.available_sqm} m²</small>
        </div>

        <div className="form-group">
          <label>Periodo</label>
          <select value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
            {availablePeriods.map(period => (
              <option key={period} value={period}>
                {periodLabels[period]} - Bs. {space[priceFields[period]]}/m²
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Cantidad de periodos</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          />
        </div>
      </div>

      {calculation && (
        <div className="calc-result">
          <div className="result-row">
            <span>Precio por m²:</span>
            <span>Bs. {calculation.pricePerSqm.toFixed(2)}</span>
          </div>
          <div className="result-row">
            <span>{calculation.sqm} m² x {calculation.quantity} {periodLabels[calculation.periodType]}:</span>
            <span className="total">Bs. {calculation.total.toFixed(2)}</span>
          </div>
          <hr />
          <div className="result-row highlight">
            <span>Anticipo ({calculation.depositPercentage}%):</span>
            <span className="deposit">Bs. {calculation.deposit.toFixed(2)}</span>
          </div>
          <div className="result-row">
            <span>Saldo restante:</span>
            <span>Bs. {calculation.remaining.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default Calculator
