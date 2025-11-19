import { Injectable, signal, inject } from '@angular/core';
import BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorTileLayer from 'ol/layer/VectorTile';
import { BrtLayerService } from './brt-layer';
import { OsmLayerService } from './osm-layer';
import { LuchtfotoLayer } from './luchtfoto-layer';
import { BagLayerService } from './bag-layer';

// --- INTERFACES ---
// Interface for Overlay Layers
export interface AppLayer {
  id: string;
  name: string;
  visible: boolean;
  layer: TileLayer<any> | VectorTileLayer; // BaseLayer; // The actual OpenLayers object
}

// Interface for Base Maps
export interface BaseMap {
  id: string;
  name: string;
  layer: TileLayer<any> | VectorTileLayer;
}

@Injectable({ providedIn: 'root' })
export class LayerManager {
  // --- BASEMAP STATE ---
  private readonly _availableBaseMaps = signal<BaseMap[]>([]);
  private readonly _activeBaseMapId = signal<string>('pdok-brt');

  // Public signals for components to read
  public readonly availableBaseMaps = this._availableBaseMaps.asReadonly();
  public readonly activeBaseMap = this._activeBaseMapId.asReadonly();

  // --- OVERLAY LAYER STATE ---
  private readonly _layers = signal<AppLayer[]>([]);
  public readonly layers = this._layers.asReadonly();

  // Inject layer services
  private readonly brtLayerService = inject(BrtLayerService);
  private readonly osmLayerService = inject(OsmLayerService);
  private readonly luchtfotoLayerService = inject(LuchtfotoLayer);
  private readonly bagLayerService = inject(BagLayerService);

  constructor() {
    this.initializeBaseMapsAsync().then(() => {
      console.log('LayerManager backgrounds loaded');
    });
    this.initializeDefaultOverlayAsync().then(() => {
      console.log('LayerManager overlays loaded');
    });
  }

  /**
   * Initializes all base map layers
   */
  private async initializeBaseMapsAsync(): Promise<void> {
    const baseMaps: BaseMap[] = [];

    try {
      // 1. PDOK BRT (OGC API Vector Tiles)
      console.log('Initializing PDOK BRT layer...');
      const pdokBrtLayer = await this.brtLayerService.createLayer('standaard');
      pdokBrtLayer.set('id', 'pdok-brt');
      baseMaps.push({
        id: 'pdok-brt',
        name: 'PDOK BRT',
        layer: pdokBrtLayer,
      });
      console.log('PDOK BRT layer initialized successfully');
    } catch (error) {
      console.error('Could not initialize PDOK BRT Vector Layer:', error);
      // If PDOK fails, we'll just use OSM. Set it as active.
      this._activeBaseMapId.set('osm');
    }

    // 2. OpenStreetMap (OSM) - Always add as a fallback
    console.log('Initializing OSM layer...');
    const osmLayer = this.osmLayerService.createLayer();
    osmLayer.set('id', 'osm');
    baseMaps.push({
      id: 'osm',
      name: 'OpenStreetMap',
      layer: osmLayer,
    });
    console.log('OSM layer initialized successfully');

    // Luchtfotos
    try {
      console.log('Initializing Luchtfotos');
      const luchtfotoLayer = await this.luchtfotoLayerService.createLayer();
      luchtfotoLayer.set('id', 'luchtfoto');
      baseMaps.push({
        id: 'luchtfoto',
        name: 'Luchtfoto',
        layer: luchtfotoLayer,
      });
      console.log('Luchtfoto layer initialized successfully');
    } catch (error) {
      console.error('Could not initialize Luchtfoto Layer');
    }

    // 3. Set the signal with all available basemaps
    console.log('Setting availableBaseMaps signal with', baseMaps.length, ' basemaps');
    this._availableBaseMaps.set(baseMaps);
    console.log('availableBaseMaps signal set');

    // 4. Set initial visibility based on the active ID
    console.log('Calling updateBaseMapVisibility for initial state');
    this.updateBaseMapVisibility();
  }

  private async initializeDefaultOverlayAsync(): Promise<void> {
    const overlayMaps: AppLayer[] = [];

    try {
      // 1. BAG (OGC API Vector Tiles)
      console.log('Initializing BAG layer...');
      const bagLayer = await this.bagLayerService.createLayer();
      bagLayer.set('id', 'bag');
      overlayMaps.push({
        id: 'bag',
        name: 'BAG',
        layer: bagLayer,
        visible: true,
      });
      console.log('BAG layer initialized successfully');
    } catch (error) {
      console.error('Could not initialize BAG layer');
    }
    // 3. Set the signal with all available basemaps
    console.log('Setting overlay layers signal with', overlayMaps.length, ' overlays');
    this._layers.set(overlayMaps);
    console.log('layers signal set');
  }
  // --- BASEMAP METHODS ---

  /**
   * Sets the active base map by ID
   * @param id The ID of the base map to activate
   */
  setActiveBaseMap(id: string): void {
    console.log('=== LayerManager - setActiveBaseMap ===');
    console.log('New active basemap ID:', id);
    console.log('Current active basemap ID:', this._activeBaseMapId());
    this._activeBaseMapId.set(id);
    console.log('Signal updated to:', this._activeBaseMapId());
    this.updateBaseMapVisibility();
    console.log('=== End setActiveBaseMap ===');
  }

  /**
   * Updates the visibility of all base maps based on the active ID
   */
  private updateBaseMapVisibility(): void {
    const activeId = this.activeBaseMap();
    this.availableBaseMaps().forEach((basemap) => {
      console.log(
        'updateBaseMapVisibility - basemap:',
        basemap.id,
        'active:',
        activeId.valueOf(),
        'set to:',
        basemap.id === activeId
      );
      basemap.layer.setVisible(basemap.id === activeId);
    });
  }

  /**
   * Adds a new base map layer dynamically
   * @param id Unique identifier for the base map
   * @param name Display name for the base map
   * @param layer The OpenLayers layer object
   */
  addBaseMap(id: string, name: string, layer: TileLayer<any> | VectorTileLayer): void {
    layer.set('id', id);
    this._availableBaseMaps.update((current) => [...current, { id, name, layer }]);
    this.updateBaseMapVisibility();
  }

  /**
   * Removes a base map by ID
   * @param id The ID of the base map to remove
   */
  removeBaseMap(id: string): void {
    // Don't remove if it's the active one
    if (this.activeBaseMap() === id) {
      console.warn('Cannot remove active base map. Switch to another base map first.');
      return;
    }

    this._availableBaseMaps.update((current) => current.filter((bm) => bm.id !== id));
  }

  // --- OVERLAY LAYER METHODS ---

  /**
   * Adds an overlay layer
   * @param layerData The layer data including id, name, visibility, and layer object
   */
  addLayer(layerData: AppLayer): void {
    // Ensure layer visibility matches its state
    layerData.layer.setVisible(layerData.visible);
    this._layers.update((current) => [...current, layerData]);
  }

  /**
   * Toggles the visibility of an overlay layer
   * @param id The ID of the layer to toggle
   * @param visible Whether the layer should be visible
   */
  toggleLayerVisibility(id: string, visible: boolean): void {
    // Update the signal state
    this._layers.update((currentLayers) =>
      currentLayers.map((l) => (l.id === id ? { ...l, visible: visible } : l))
    );

    // Update the OpenLayers layer object
    const layerToUpdate = this.layers().find((l) => l.id === id);
    layerToUpdate?.layer.setVisible(visible);
  }

  /**
   * Removes an overlay layer by ID
   * @param id The ID of the layer to remove
   */
  removeLayer(id: string): void {
    this._layers.update((current) => current.filter((l) => l.id !== id));
  }
}
