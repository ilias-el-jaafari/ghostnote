type MixSliderProps = {
  label: string
  value: number
  onChange: (value: number) => void
  hint?: string
}

export function MixSlider({ label, value, onChange, hint }: MixSliderProps) {
  const percent = Math.round(value * 100)
  return (
    <label className="mix-slider">
      <span className="mix-slider-row">
        <span className="mix-slider-label outlined">{label}</span>
        <span className="mix-slider-value outlined">{percent}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      {hint ? <small className="mix-slider-hint">{hint}</small> : null}
    </label>
  )
}
