import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAsset } from '../core/assets/upload';
import { readEmbedParams } from '../core/embed/bridge';
import { getConfigurator, useConfigurator } from '../core/state/store';
import { DEFAULT_PRODUCT, products } from '../products/registry';
import { App } from './App';
import { ServicesContext, createServices } from './services';
import './styles.css';

const embed = readEmbedParams();
const product = products[embed.productId ?? DEFAULT_PRODUCT] ?? products[DEFAULT_PRODUCT];
getConfigurator().init(product, embed.options);
document.title = `${product.name} Designer`;

const services = createServices(embed);

if (import.meta.env.DEV) {
  // Dev-only handle for scripted end-to-end checks; stripped from production builds.
  Object.assign(window, { __configurator: { store: useConfigurator, createAsset } });
}

if (embed.designId) {
  // Reopen a saved design: /?design=d_xxxx
  services.designs
    .load(embed.designId)
    .then(({ design }) => getConfigurator().loadDesign(design))
    .catch((error) => console.warn('Could not load saved design', error));
}

document.documentElement.toggleAttribute('data-embedded', embed.embedded);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ServicesContext.Provider value={services}>
      <App />
    </ServicesContext.Provider>
  </StrictMode>,
);
