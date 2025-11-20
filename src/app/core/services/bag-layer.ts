import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { get as getProjection } from 'ol/proj';
import { getTopLeft } from 'ol/extent';
import TileGrid from 'ol/tilegrid/TileGrid';
import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import MVT from 'ol/format/MVT';
import { FeatureLike } from 'ol/Feature';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { TileMatrixSet, TileMatrix } from '../map/map.interface';
import { StyleFunction } from 'ol/style/Style';
import { asArray } from 'ol/color';

@Injectable({ providedIn: 'root' })
export class BagLayerService {
  private readonly http = inject(HttpClient);
  private readonly pdokBaseUrl = 'https://api.pdok.nl/lv/bag/ogc/v1';
  private readonly tileMatrixSetId = 'NetherlandsRDNewQuad';

  async createLayer(): Promise<VectorTileLayer> {
    console.log('BAG Layer Service: Starting layer creation');

    const tileMatrixSet = await this.getTileMatrixSet();
    if (!tileMatrixSet) {
      throw new Error('Failed to fetch TileMatrixSet from PDOK for BAG');
    }

    const styleJson = await this.getStyleJson();
    if (!styleJson) {
      throw new Error('Failed to fetch style JSON from PDOK for BAG');
    }

    const layer = this.buildVectorTileLayer(tileMatrixSet, styleJson);

    console.log('BAG Layer Service: Layer created successfully');
    return layer;
  }

  private async getStyleJson(): Promise<any> {
    try {
      const styleId = 'bag_standaardvisualisatie__netherlandsrdnewquad';
      const url = `${this.pdokBaseUrl}/styles/${styleId}?f=json`;
      console.log('BAG Layer Service: Fetching style JSON from:', url);

      const response = await firstValueFrom(
        this.http.get<any>(url, {
          headers: { Accept: 'application/json' },
        })
      );

      console.log('BAG Layer Service: Style JSON fetched successfully');
      return response;
    } catch (error) {
      console.error('BAG Layer Service: Error fetching style JSON:', error);
      return null;
    }
  }

  private async getTileMatrixSet(): Promise<TileMatrixSet | null> {
    try {
      const url = `${this.pdokBaseUrl}/tileMatrixSets/${this.tileMatrixSetId}`;
      console.log('BAG Layer Service: Fetching tile matrix set from:', url);

      const response = await firstValueFrom(
        this.http.get<TileMatrixSet>(url, {
          headers: { Accept: 'application/json' },
        })
      );

      console.log('BAG Layer Service: Tile matrix set fetched successfully');
      return response;
    } catch (error) {
      console.error('BAG Layer Service: Error fetching tile matrix set:', error);
      return null;
    }
  }

  /**
   * Converts Mapbox GL color to OpenLayers color format
   * Handles strings, arrays, and Mapbox GL expressions
   */
  private parseColor(color: any, opacity: number = 1): string {
    if (!color) return `rgba(0, 0, 0, ${opacity})`;

    // If color is an array (Mapbox GL expression), extract the actual color value
    if (Array.isArray(color)) {
      // Handle common Mapbox GL expression patterns
      // e.g., ["get", "color"] or ["case", condition, trueColor, falseColor]
      // For simplicity, try to find the first string that looks like a color
      for (const item of color) {
        if (
          typeof item === 'string' &&
          (item.startsWith('#') || item.startsWith('rgb') || item.startsWith('hsl'))
        ) {
          color = item;
          break;
        }
      }
      // If still an array, use a default color
      if (Array.isArray(color)) {
        console.warn('BAG Layer: Complex color expression not fully supported, using default');
        return `rgba(128, 128, 128, ${opacity})`;
      }
    }

    // Ensure color is a string at this point
    if (typeof color !== 'string') {
      return `rgba(0, 0, 0, ${opacity})`;
    }

    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    // Handle rgb/rgba colors
    if (color.startsWith('rgb')) {
      if (opacity < 1 && !color.includes('rgba')) {
        // Convert rgb to rgba with opacity
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`;
        }
      }
      return color;
    }

    // Handle hsl colors (basic conversion)
    if (color.startsWith('hsl')) {
      // For simplicity, return as-is (browsers support hsl)
      // You could implement HSL to RGB conversion if needed
      return color;
    }

    return color;
  }

  /**
   * Creates a style function from Mapbox GL style specification
   */
  private createStyleFromMapboxGL(styleJson: any): StyleFunction {
    console.log('BAG Layer Service: Converting Mapbox GL style to OpenLayers');

    // Parse the Mapbox GL style layers
    const styleLayers = styleJson.layers || [];

    // Create a map of layer styles by source-layer
    const layerStyleMap = new Map<string, any[]>();

    styleLayers.forEach((layer: any) => {
      const sourceLayer = layer['source-layer'];
      if (sourceLayer) {
        if (!layerStyleMap.has(sourceLayer)) {
          layerStyleMap.set(sourceLayer, []);
        }
        layerStyleMap.get(sourceLayer)?.push(layer);
      }
    });

    console.log('BAG Layer Service: Parsed style layers:', layerStyleMap.size, 'source layers');

    return (feature: FeatureLike, resolution: number): Style | Style[] => {
      const sourceLayer = feature.get('layer'); // MVT features have a 'layer' property

      if (!sourceLayer) {
        return new Style(); // Empty style if no layer info
      }

      const styles: Style[] = [];
      const layerStyles = layerStyleMap.get(sourceLayer) || [];

      for (const layerStyle of layerStyles) {
        const layerType = layerStyle.type;
        const paint = layerStyle.paint || {};
        const layout = layerStyle.layout || {};

        // Check zoom level constraints
        const minzoom = layerStyle.minzoom;
        const maxzoom = layerStyle.maxzoom;

        // Convert resolution to zoom level (approximate)
        // This is a rough conversion - you may need to adjust based on your tile grid
        const zoom = Math.log2(156543.03392804097 / resolution);

        if (minzoom !== undefined && zoom < minzoom) continue;
        if (maxzoom !== undefined && zoom > maxzoom) continue;

        // Check visibility
        const visibility = layout.visibility;
        if (visibility === 'none') continue;

        let olStyle: Style | undefined;

        if (layerType === 'fill') {
          const fillColor = this.parseColor(paint['fill-color'], paint['fill-opacity'] ?? 1);
          const strokeColor = this.parseColor(paint['fill-outline-color'], 1);

          olStyle = new Style({
            fill: new Fill({
              color: fillColor,
            }),
            stroke:
              strokeColor !== 'rgba(0, 0, 0, 1)'
                ? new Stroke({
                    color: strokeColor,
                    width: 1,
                  })
                : undefined,
          });
        } else if (layerType === 'line') {
          const lineColor = this.parseColor(paint['line-color'], paint['line-opacity'] ?? 1);
          const lineWidth = paint['line-width'] ?? 1;

          olStyle = new Style({
            stroke: new Stroke({
              color: lineColor,
              width: lineWidth,
            }),
          });
        } else if (layerType === 'symbol') {
          // Handle text labels
          const textField = layout['text-field'];
          if (textField) {
            const textColor = this.parseColor(
              paint['text-color'] ?? '#000000',
              paint['text-opacity'] ?? 1
            );
            const textSize = paint['text-size'] ?? layout['text-size'] ?? 12;
            const textHaloColor = this.parseColor(paint['text-halo-color'], 1);
            const textHaloWidth = paint['text-halo-width'] ?? 0;

            // Extract the field name from {field_name} syntax
            let text = '';
            if (typeof textField === 'string') {
              const match = textField.match(/\{([^}]+)\}/);
              if (match) {
                const fieldName = match[1];
                text = feature.get(fieldName) || '';
              } else {
                text = textField;
              }
            }

            if (text) {
              olStyle = new Style({
                text: new Text({
                  text: text.toString(),
                  fill: new Fill({ color: textColor }),
                  stroke:
                    textHaloWidth > 0
                      ? new Stroke({
                          color: textHaloColor,
                          width: textHaloWidth,
                        })
                      : undefined,
                  font: `${textSize}px sans-serif`,
                }),
              });
            }
          }
        }

        if (olStyle) {
          styles.push(olStyle);
        }
      }

      return styles.length > 0 ? styles : new Style();
    };
  }

  private buildVectorTileLayer(tileMatrixSet: TileMatrixSet, styleJson: any): VectorTileLayer {
    const urlTemplate = `${this.pdokBaseUrl}/tiles/${this.tileMatrixSetId}/{z}/{y}/{x}?f=mvt`;
    console.log('BAG Layer Service: Building layer with URL template:', urlTemplate);

    const projection = getProjection('EPSG:28992');
    if (!projection) {
      throw new Error('EPSG:28992 projection not found');
    }

    const resolutions: number[] = [];
    const tileSize = 256;

    const sortedMatrices = [...(tileMatrixSet.tileMatrices || [])].sort(
      (a, b) => b.scaleDenominator - a.scaleDenominator
    );

    sortedMatrices.forEach((matrix: TileMatrix) => {
      resolutions.push(matrix.scaleDenominator * 0.00028);
    });

    console.log('BAG Layer Service: Resolutions calculated:', resolutions.length, 'levels');

    // Zoom level restriction for Z12
    let maxResolution = Infinity;
    let minResolution = 0;

    const Z11_INDEX = 11;
    const Z13_INDEX = 13;

    if (resolutions.length > Z13_INDEX) {
      maxResolution = resolutions[Z11_INDEX];
      minResolution = resolutions[Z13_INDEX];

      console.log(
        `BAG Layer Service: Restricted visibility to Z12: MaxRes=${maxResolution.toFixed(
          2
        )}, MinRes=${minResolution.toFixed(4)}`
      );
    } else {
      console.warn(
        `BAG Layer Service: Insufficient resolutions (${resolutions.length}) to strictly define Z12 range.`
      );
    }

    const extent = projection.getExtent() || [-285401.92, 22598.08, 595401.92, 903401.92];
    const origin = getTopLeft(extent);

    const tileGrid = new TileGrid({
      origin: origin,
      resolutions: resolutions,
      tileSize: tileSize,
    });

    // Create tile URL function that forces Z12
    const tileUrlFunction = (tileCoord: any) => {
      if (!tileCoord) return undefined;

      // tileCoord is [z, x, y] but we always want to use Z12
      const z = 12; // Force zoom level 12
      const x = tileCoord[1];
      const y = tileCoord[2];

      return `${this.pdokBaseUrl}/tiles/${this.tileMatrixSetId}/${z}/${y}/${x}?f=mvt`;
    };

    const vectorTileSource = new VectorTileSource({
      format: new MVT(),
      tileUrlFunction: tileUrlFunction,
      projection: projection,
      attributions: ['© Kadaster (BAG)'],
      tileGrid: tileGrid,
      // Restrict to only load at zoom level 12
      minZoom: 12,
      maxZoom: 12,
    });

    // Create style function from Mapbox GL style
    const styleFunction = this.createStyleFromMapboxGL(styleJson);

    const vectorTileLayer = new VectorTileLayer({
      source: vectorTileSource,
      properties: {
        id: 'bag',
        name: 'BAG Panden',
        type: 'overlay',
      },
      maxResolution: maxResolution,
      minResolution: minResolution,
      style: styleFunction,
    });

    console.log('BAG Layer Service: VectorTileLayer created with PDOK styling');
    return vectorTileLayer;
  }
}
