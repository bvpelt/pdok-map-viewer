import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import TileLayer from 'ol/layer/Tile';
import WMTS, { optionsFromCapabilities } from 'ol/source/WMTS';
import WMTSCapabilities from 'ol/format/WMTSCapabilities';

@Injectable({ providedIn: 'root' })
export class LuchtfotoLayer {
  private readonly http = inject(HttpClient);

  // The WMTS Capabilities URL for PDOK Luchtfoto RGB
  private readonly capabilitiesUrl =
    'https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0?request=GetCapabilities&service=WMTS';

  /**
   * Creates a PDOK Luchtfoto layer
   * @param layerName The specific layer identifier (e.g., 'Actueel_ortho25' or '2024_ortho25')
   */
  async createLayer(layerName: string = 'Actueel_ortho25'): Promise<TileLayer<WMTS>> {
    try {
      // 1. Fetch the capabilities XML
      const capabilitiesXml = await firstValueFrom(
        this.http.get(this.capabilitiesUrl, { responseType: 'text' })
      );

      // 2. Parse the XML
      const parser = new WMTSCapabilities();
      const result = parser.read(capabilitiesXml);

      // 3. Generate OpenLayers WMTS options
      // We explicitly request the EPSG:28992 matrix set to match your BRT/Map projection
      const options = optionsFromCapabilities(result, {
        layer: layerName,
        matrixSet: 'EPSG:28992',
      });

      if (!options) {
        throw new Error(`Could not generate WMTS options for layer '${layerName}'`);
      }

      // 4. Create the layer
      const layer = new TileLayer({
        source: new WMTS(options),
        visible: false, // Managed by LayerManager
        properties: {
          name: 'PDOK Luchtfoto',
          type: 'background',
        },
      });

      return layer;
    } catch (error) {
      console.error('Error creating Luchtfoto layer:', error);
      throw error;
    }
  }
}
