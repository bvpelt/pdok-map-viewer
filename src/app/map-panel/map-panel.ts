import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  effect,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { Map, View } from 'ol';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import { LayerManager } from '../core/services/layer-manager';
import 'ol/ol.css'; // Import OpenLayers CSS

@Component({
  selector: 'app-map-panel',
  standalone: true,
  imports: [],
  templateUrl: './map-panel.html',
  styleUrl: './map-panel.scss',
})
export class MapPanel implements AfterViewInit, OnDestroy {
  @ViewChild('mapTarget') mapTarget!: ElementRef;
  map!: Map;
  private mapInitialized = false;

  constructor(private layerManager: LayerManager) {
    // Register EPSG:28992 projection
    this.registerRDProjection();

    // Effect to reactively add basemaps when they become available
    effect(() => {
      console.log('Effect 1 triggered: basemaps effect, map initialized:', this.mapInitialized);

      if (!this.map || !this.mapInitialized) {
        console.log('Effect 1: Map not ready yet');
        return;
      }

      const basemaps = this.layerManager.availableBaseMaps();
      console.log('Effect 1: availableBaseMaps changed, count:', basemaps.length);

      // Get current map layers
      const currentMapLayers = this.map.getLayers().getArray();

      // Add any new basemaps to the map
      basemaps.forEach((basemap) => {
        const existingLayer = currentMapLayers.find((l) => l.get('id') === basemap.id);

        if (!existingLayer) {
          console.log('Effect 1: Adding basemap to map:', basemap.id);
          basemap.layer.set('isBaseMap', true);
          basemap.layer.set('id', basemap.id);

          // Add layer at the bottom (index 0) so it's behind overlays
          this.map.getLayers().insertAt(0, basemap.layer);

          console.log('Effect 1: Basemap added, visible:', basemap.layer.getVisible());
        } else {
          console.log('Effect 1: Basemap already exists:', basemap.id);
        }
      });

      // Force map to render
      this.map.render();
      console.log('Effect 1: Map render called');
    });

    // Effect to reactively update basemap visibility
    effect(() => {
      console.log('Effect 2 triggered: visibility effect, map initialized:', this.mapInitialized);

      if (!this.map || !this.mapInitialized) {
        console.log('Effect 2: Map not ready yet');
        return;
      }

      const activeId = this.layerManager.activeBaseMap();
      console.log('Effect 2: Active basemap changed to:', activeId);

      // Update visibility of all basemaps
      const basemaps = this.layerManager.availableBaseMaps();
      basemaps.forEach((basemap) => {
        const isActive = basemap.id === activeId;
        console.log(`Effect 2: Setting ${basemap.id} visible: ${isActive}`);
        basemap.layer.setVisible(isActive);
      });

      // Force map to render
      this.map.render();
      console.log('Effect 2: Map render called');
    });

    // Effect to reactively update overlay layers
    effect(() => {
      console.log('Effect 3 triggered: overlay layers effect');

      if (!this.map || !this.mapInitialized) {
        console.log('Effect 3: Map not ready yet');
        return;
      }

      const overlayLayers = this.layerManager.layers();
      console.log('Effect 3: Overlay layers changed, count:', overlayLayers.length);

      // Sync overlay layers with the map
      // First, remove any layers from the map that are no longer in the service
      this.map
        .getLayers()
        .getArray()
        .filter((olLayer) => olLayer.get('id') && !olLayer.get('isBaseMap'))
        .forEach((olLayer) => {
          if (!overlayLayers.find((appLayer) => appLayer.id === olLayer.get('id'))) {
            this.map.removeLayer(olLayer);
            console.log('Effect 3: Removed layer:', olLayer.get('id'));
          }
        });

      // Second, add any new layers from the service to the map
      overlayLayers.forEach((appLayer) => {
        const existingLayer = this.map
          .getLayers()
          .getArray()
          .find((l) => l.get('id') === appLayer.id);

        if (!existingLayer) {
          appLayer.layer.set('id', appLayer.id);
          this.map.addLayer(appLayer.layer);
          console.log('Effect 3: Added overlay layer:', appLayer.id);
        }
      });
    });
  }

  private registerRDProjection(): void {
    // Define EPSG:28992 (Amersfoort / RD New - Netherlands)
    proj4.defs(
      'EPSG:28992',
      '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 ' +
        '+x_0=155000 +y_0=463000 +ellps=bessel ' +
        '+towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 ' +
        '+units=m +no_defs'
    );
    register(proj4);
  }

  ngAfterViewInit(): void {
    console.log('=== MapPanel ngAfterViewInit START ===');
    console.log('MapPanel ngAfterViewInit - mapTarget:', this.mapTarget);

    // Use EPSG:28992 projection centered on the Netherlands
    this.map = new Map({
      target: this.mapTarget.nativeElement,
      view: new View({
        projection: 'EPSG:28992',
        center: [155000, 463000], // Amersfoort in RD coordinates
        zoom: 3,
        extent: [-285401.92, 22598.08, 595401.92, 903401.92], // Netherlands bounds
      }),
    });

    console.log('Map object created');

    // Mark map as initialized
    this.mapInitialized = true;
    console.log('Map marked as initialized');

    // Force map to update its size after initialization
    setTimeout(() => {
      this.map.updateSize();
      console.log('Map size updated');

      // Manually trigger adding basemaps if effects haven't run yet
      const basemaps = this.layerManager.availableBaseMaps();
      console.log('Available basemaps at init:', basemaps.length);

      if (basemaps.length > 0) {
        basemaps.forEach((basemap) => {
          const existingLayer = this.map
            .getLayers()
            .getArray()
            .find((l) => l.get('id') === basemap.id);

          if (!existingLayer) {
            console.log('Manually adding basemap:', basemap.id);
            basemap.layer.set('isBaseMap', true);
            basemap.layer.set('id', basemap.id);
            this.map.getLayers().insertAt(0, basemap.layer);
          }
        });

        // Set visibility based on active basemap
        const activeId = this.layerManager.activeBaseMap();
        console.log('Active basemap ID:', activeId);

        basemaps.forEach((basemap) => {
          const isActive = basemap.id === activeId;
          console.log(`Setting ${basemap.id} visible: ${isActive}`);
          basemap.layer.setVisible(isActive);
        });

        this.map.render();
      }

      // Log map layers after a moment
      setTimeout(() => {
        console.log('=== Current map state ===');
        console.log('Total map layers:', this.map.getLayers().getLength());
        this.map.getLayers().forEach((layer, index) => {
          console.log(`Layer ${index}:`, layer.get('id'), 'visible:', layer.getVisible());
        });
        console.log('=== End current map state ===');
      }, 500);
    }, 100);

    console.log('=== MapPanel ngAfterViewInit END ===');
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.setTarget(undefined);
    }
  }
}
