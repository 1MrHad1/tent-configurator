import { useConfigurator } from '../../core/state/store';
import { useViewerControls } from '../viewer/viewerControls';

export function ViewButtons() {
  const views = useConfigurator((s) => s.product.views);
  const { request, goTo } = useViewerControls();
  return (
    <div className="view-buttons" role="group" aria-label="Camera views">
      {views.map((v) => (
        <button key={v.id} type="button" className={request.viewId === v.id ? 'is-on' : ''} onClick={() => goTo(v.id)}>
          {v.label}
        </button>
      ))}
    </div>
  );
}
