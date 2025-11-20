import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  effect,
  OnDestroy,
  NgZone,
  signal,
} from '@angular/core';
import { Map, View } from 'ol';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import { LayerManager } from '../core/services/layer-manager';
import 'ol/ol.css';

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

  // Use a signal to track initialization state so effects can react to it
  private readonly mapInitialized = signal(false);

  constructor(private layerManager: LayerManager, private ngZone: NgZone) {
    // Register EPSG:28992 projection
    this.registerRDProjection();

    // Effect 1: Basemap loading
    effect(() => {
      const initialized = this.mapInitialized();
      console.log('Effect 1 triggered: basemaps effect, map initialized:', initialized);

      if (!this.map || !initialized) {
        console.log('Effect 1: Map not ready yet');
        return;
      }

      const basemaps = this.layerManager.availableBaseMaps();
      const activeId = this.layerManager.activeBaseMap();
      console.log('Effect 1: availableBaseMaps changed, count:', basemaps.length);

      const currentMapLayers = this.map.getLayers().getArray();

      basemaps.forEach((basemap) => {
        const existingLayer = currentMapLayers.find((l) => l.get('id') === basemap.id);
        if (!existingLayer) {
          console.log('Effect 1: Adding basemap to map:', basemap.id);
          basemap.layer.set('isBaseMap', true);
          basemap.layer.set('id', basemap.id);

          // Set initial visibility based on active basemap
          const isActive = basemap.id === activeId;
          basemap.layer.setVisible(isActive);
          console.log(`Effect 1: Adding basemap ${basemap.id}, visible: ${isActive}`);

          this.map.getLayers().insertAt(0, basemap.layer);
        } else {
          console.log('Effect 1: Basemap already exists:', basemap.id);
        }
      });

      this.map.render();
      console.log('Effect 1: Map render called');
    });

    // Effect 2: Basemap visibility
    effect(() => {
      const initialized = this.mapInitialized();
      console.log('Effect 2 triggered: visibility effect, map initialized:', initialized);

      if (!this.map || !initialized) {
        console.log('Effect 2: Map not ready yet');
        return;
      }

      const activeId = this.layerManager.activeBaseMap();
      console.log('Effect 2: Active basemap changed to:', activeId);

      const basemaps = this.layerManager.availableBaseMaps();
      basemaps.forEach((basemap) => {
        const isActive = basemap.id === activeId;
        console.log(`Effect 2: Setting ${basemap.id} visible: ${isActive}`);
        basemap.layer.setVisible(isActive);
      });

      this.map.render();
      console.log('Effect 2: Map render called');
    });

    // Effect 3: Overlay layers (Add/Remove)
    effect(() => {
      const initialized = this.mapInitialized();
      console.log('Effect 3 triggered: overlay layers effect, initialized:', initialized);

      if (!this.map || !initialized) {
        console.log('Effect 3: Map not ready yet');
        return;
      }

      const overlayLayers = this.layerManager.layers();
      console.log('Effect 3: Overlay layers changed, count:', overlayLayers.length);

      const currentOLOverlays = this.map
        .getLayers()
        .getArray()
        .filter((olLayer) => olLayer.get('id') && !olLayer.get('isBaseMap'));

      // 1. Add new layers
      overlayLayers.forEach((appLayer) => {
        if (!currentOLOverlays.find((l) => l.get('id') === appLayer.id)) {
          appLayer.layer.set('id', appLayer.id);
          this.map.addLayer(appLayer.layer);
          console.log('Effect 3: Added overlay layer:', appLayer.id);
        }
      });

      // 2. Remove layers
      currentOLOverlays.forEach((olLayer) => {
        if (!overlayLayers.find((appLayer) => appLayer.id === olLayer.get('id'))) {
          this.map.removeLayer(olLayer);
          console.log('Effect 3: Removed layer:', olLayer.get('id'));
        }
      });

      this.map.render();
    });

    // Effect 4: Monitor layersWithAvailability to update actual visibility
    effect(() => {
      const initialized = this.mapInitialized();
      if (!this.map || !initialized) {
        return;
      }

      // This computed signal already handles setting visibility on the OL layers
      // We just need to trigger this effect when it changes
      const layersUI = this.layerManager.layersWithAvailability();
      console.log('Effect 4: Layer availability updated, count:', layersUI.length);

      this.map.render();
    });
  }

  private registerRDProjection(): void {
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

    this.map = new Map({
      target: this.mapTarget.nativeElement,
      view: new View({
        projection: 'EPSG:28992',
        center: [155000, 463000],
        zoom: 5,
        extent: [-285401.92, 22598.08, 595401.92, 903401.92],
      }),
    });

    console.log('Map object created');

    const view = this.map.getView();

    // Add resolution listener
    this.ngZone.runOutsideAngular(() => {
      view.on('change:resolution', () => {
        this.ngZone.run(() => {
          const resolution = view.getResolution();
          if (resolution !== undefined) {
            console.log('Resolution changed to:', resolution.toFixed(4));
            this.layerManager.setCurrentResolution(resolution);
          }
        });
      });
    });

    // Set initial resolution
    const initialResolution = view.getResolution();
    if (initialResolution !== undefined) {
      console.log('Initial resolution:', initialResolution.toFixed(4));
      this.layerManager.setCurrentResolution(initialResolution);
    }

    // Update map size after a short delay
    setTimeout(() => {
      this.map.updateSize();
      this.map.render();
      console.log('Map size updated and rendered');
    }, 100);

    // IMPORTANT: Set initialized to true AFTER everything is set up
    // This will trigger all effects to re-run
    this.mapInitialized.set(true);
    console.log('Map marked as initialized - effects will now run');

    console.log('=== MapPanel ngAfterViewInit END ===');
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.setTarget(undefined);
    }
  }
}
