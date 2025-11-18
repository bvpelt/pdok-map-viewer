import { Injectable } from '@angular/core';
import TileLayer from 'ol/layer/Tile';
import { XYZ } from 'ol/source';

@Injectable({
  providedIn: 'root',
})
export class OsmLayerService {
  createLayer() {
    const osmLayer = new TileLayer({
      source: new XYZ({
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attributions: ['© OpenStreetMap contributors'],
        // OSM tiles are in EPSG:3857, OpenLayers will reproject to EPSG:28992
      }),
    });

    return osmLayer;
  }
}
