import { isOptionVisible } from '../../../core/design/factory';
import { useConfigurator } from '../../../core/state/store';
import { useCatalog } from '../../hooks/usePricing';
import { Field } from '../controls';

/** Product options. Price hints come from the pricing API's catalog endpoint, never from code. */
export function ProductPanel() {
  const product = useConfigurator((s) => s.product);
  const options = useConfigurator((s) => s.design.options);
  const quantity = useConfigurator((s) => s.design.quantity);
  const notes = useConfigurator((s) => s.design.notes);
  const { setOption, setQuantity, setNotes } = useConfigurator.getState();
  const catalog = useCatalog();

  return (
    <div className="panel-body">
      {product.options
        .filter((o) => isOptionVisible(product, o.id, options))
        .map((option) => (
          <Field key={option.id} label={option.label}>
            <div className="choice-list" role="radiogroup" aria-label={option.label}>
              {option.choices.map((choice) => {
                const selected = options[option.id] === choice.id;
                const hint = catalog?.hints[option.id]?.[choice.id];
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`choice${selected ? ' is-on' : ''}`}
                    onClick={() => setOption(option.id, choice.id)}
                  >
                    <span className="choice-main">
                      <span className="choice-label">{choice.label}</span>
                      {choice.description && <span className="choice-desc">{choice.description}</span>}
                    </span>
                    <span className="choice-hint">{selected ? '' : (hint ?? '')}</span>
                  </button>
                );
              })}
            </div>
          </Field>
        ))}

      <Field label="Quantity">
        <div className="stepper">
          <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(quantity - 1)} disabled={quantity <= 1}>
            −
          </button>
          <input type="number" min={1} max={500} value={quantity} aria-label="Quantity" onChange={(e) => setQuantity(Number(e.target.value))} />
          <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(quantity + 1)}>
            +
          </button>
        </div>
      </Field>

      <Field label="Design notes" hint="optional">
        <textarea rows={3} maxLength={2000} placeholder="Anything production should know: Pantone matches, placement…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {catalog && (
        <ul className="rules" aria-label="Pricing rules">
          {catalog.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
