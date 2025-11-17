import { Component, AfterViewInit, ViewChild, ElementRef, effect } from '@angular/core';
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import { OSM } from 'ol/source';
import { useGeographic } from 'ol/proj';
import { LayerManager } from '../core/services/layer-manager';

@Component({
  selector: 'app-map-panel',
  imports: [],
  templateUrl: './map-panel.html',
  styleUrl: './map-panel.scss',
})
export class MapPanel implements AfterViewInit {
  @ViewChild('mapTarget') mapTarget!: ElementRef;
  map!: Map;

  constructor(private layerManager: LayerManager) {
    // Use an effect to reactively update the map when layers change
    effect(() => {
      if (this.map) {
        console.log('Layers changed, updating map...');
        // This is a simple way to sync. You could make this smarter.
        this.map.getLayers().clear(); // Clear existing layers
        this.addBasemap(); // Re-add basemap

        // Add all layers from the service
        this.layerManager.layers().forEach((appLayer) => {
          this.map.addLayer(appLayer.layer);
        });
      }
    });
  }

  ngAfterViewInit() {
    useGeographic(); // Use Lon/Lat (EPSG:4326) for easy coordinates
    this.map = new Map({
      target: this.mapTarget.nativeElement,
      view: new View({
        center: [5.12, 52.09], // Center on the Netherlands
        zoom: 8,
      }),
    });
    this.addBasemap();
  }

  addBasemap() {
    this.map.addLayer(new TileLayer({ source: new OSM() }));
  }
}
